const WALLET = window.location.href.split("?")[1];
const CONTRACTS_URL = "https://www.r-recs.com/contracts.json";
const COMPANIES_URL = "https://www.r-recs.com/companies.json";
const RETIREMENT_WALLET = '0x51475BEdAe21624c5AD8F750cDBDc4c15Ca8F93f';
const RETURN_WALLET = '0x6E61B86d97EBe007E09770E6C76271645201fd07';
const FULL_GOAL_CIRCLE = 850;

function strcmpi(str1, str2) {
	return str1.localeCompare(str2, undefined, {sensitivity: 'base'}) === 0
}

const app = Vue.createApp({
	data() {	
		return {
			name: '',
			address: WALLET,
			smallAddress: WALLET.substring(0,4)+'...'+WALLET.substring(WALLET.length-4),
			logo: '',
			join_date: '',
			assets: [],
			activity: [],
			retired_carbon: 0,
			chart: null,
			lineChart: null,
		}
	},

	mounted() {
		fetch(COMPANIES_URL)
		.then((companiesResp) => companiesResp.json())
		.then((companies) => {
			// Find my company in the list of companies
			for (company of companies) {
				if (company.address.toLowerCase() === WALLET.toLowerCase()) {
					this.name = company['name']
					this.logo = company['logo']
					this.join_date = company['join_date']
					this.carbon_goal = company['carbon_goal']
					this.rec_goal = company['rec_goal']
					break
				}
			}
			// If not registered, load default values
			if (!this.name) {
				this.name = 'R-REC User'
				this.logo = 'https://static.wixstatic.com/media/f3e4c8_605e4a0db8f94c88ba747298bcdf3648~mv2.png/v1/crop/x_105,y_113,w_814,h_812/fill/w_812,h_812,al_c,q_90,enc_auto/Renewvia%20logo_50.png'
				this.join_date = 'Yet to be Verified'
			}
			// Scrape the contracts for transactions involving this wallet
			fetch(CONTRACTS_URL)
				.then((allContractsResp) => allContractsResp.json())
				.then((allContractsData) => {
					// For each contract
					for (let contract of allContractsData) {
						// For each transaction of that contract
						for (let trans of contract['transactions']) {
							if (trans.ignore || 
								(trans.action==='mint' && strcmpi(trans['from'],WALLET) && !strcmpi(trans['to'],WALLET))) {
								continue
							}
							// If this wallet is involved in the transaction
							if (strcmpi(trans['to'], WALLET) || strcmpi(trans['from'], WALLET)) {
								// Make the amount negative if this wallet is the sender
								trans.signedAmount = strcmpi(trans['from'], WALLET) ? trans.amount*-1 : trans.amount

								// Add the transaction to the activity table
								switch (trans.action) {
									case 'transfer':
										// If the action is a transfer from the return wallet, log accordingly
										if (strcmpi(trans['from'], RETURN_WALLET)) {
											trans.action = 'Receipt'
										} else {
											trans.action = strcmpi(trans['from'], WALLET) ? 'Sale' : 'Purchase'
										}
										break
									case 'mint':
										trans.action = 'Generation'
										break
									case 'return':
										trans.action = 'Return'
										break
									case 'retire':
										this.retired_carbon+= trans.amount
										trans.action = 'Retirement'
										break
									default:
										trans.action = trans.action.charAt(0).toUpperCase() + trans.action.slice(1)
								}
								trans.name = contract.name
								let date = new Date(trans.timeStamp*1000)
								trans.date = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`
								this.activity.push(trans)

								// Increment asset count
								let ind = -1
								for (let a=0; a<this.assets.length; a++) {
									if (this.assets[a].address == contract.address) {
										ind = a
										break
									}
								}
								if (ind == -1) {
									this.assets.push({
										name: contract.name,
										abbreviation: contract.abbreviation,
										superclass: contract.superclass,
										address: contract.address,
										signedAmount: trans.signedAmount,
										amount: trans.amount,
										img: contract.img,
										description: contract.description
									})
								} else {
									this.assets[ind].amount+= trans.signedAmount
								}
							}
						}
					}
					this.assets = this.assets.filter((asset) => asset.amount>0)
					this.activity.sort((action1, action2) => action1.timeStamp-action2.timeStamp)
				})
		})
	},

	updated() {
		// Render the chart with the new data
		if (!this.chart) {
			this.renderChart();
		}
		if (!this.lineChart) {
			this.renderLineChart();
		}

		// Update carbon goal progress
		if (this.carbon_goal) {
			console.log(this.retired_carbon)
			document.getElementById('retired-carbon').setAttribute('stroke-dasharray', `${Math.round(FULL_GOAL_CIRCLE * Math.min(this.retired_carbon / this.carbon_goal, 1))}, 999`)
			document.getElementById('total-carbon').setAttribute('stroke-dasharray', `${Math.round(FULL_GOAL_CIRCLE * Math.min((this.retired_carbon + this.totalCarbonOffsets) / this.carbon_goal, 1))} 999`)
		}
	},

	computed: {
		totalRenewableEnergy() {
			return this.assets.reduce((sum, asset) => asset.superclass === 'REC' ? sum+asset.amount : sum, 0)
		},

		totalCarbonOffsets() {
			return this.assets.reduce((sum, asset) => asset.superclass === 'CC' ? sum+asset.amount : sum, 0)
		},

		// Note: This is weird, and we should probably simplify it later. When this was written, we hadn't minted any carbon credits, but we still wanted to show approximate carbon offset. Think of it like "If you converted all of your RECs to CCs, how many carbon credits would you have?" 1451 is from AVERT, and 2205 is the number of pounds in one ton.
		totalEstimatedCarbonOffsets() {
			var carbonCredits = this.totalCarbonOffsets
			if (carbonCredits == 0) {
				return Math.round(this.assets.reduce((sum, asset) => asset.superclass === 'REC' ? sum+asset.amount : sum, 0)*1451/2205)+this.retired_carbon
			} else {
				return carbonCredits+this.retired_carbon
			}
		},

		instructionsToAchieveCarbonGoal() {
			// If you haven't reached your goal yet
			if (this.carbon_goal > this.retired_carbon) {
				let instr = `So far, you have retired ${this.retired_carbon.toLocaleString()} carbon credits. You currently own ${this.totalCarbonOffsets.toLocaleString()}. To achieve your goal of retiring ${this.carbon_goal.toLocaleString()} carbon credits, `

				// If you could reach your goal by retiring what you already have
				if (this.retired_carbon + this.totalCarbonOffsets >= this.carbon_goal) {
					return instr + `retire at least ${(this.carbon_goal-this.retired_carbon).toLocaleString()} more carbon credits.`

				// If you need to buy or convert more credits in order to reach your goal
				} else {
					instr+= `purchase at least ${(this.carbon_goal - this.totalCarbonOffsets - this.retired_carbon).toLocaleString()} more carbon credits, then retire at least ${(this.carbon_goal - this.retired_carbon).toLocaleString()} carbon credits.`
					
					// If you have RECs you could convert to carbon credits
					if (this.totalRenewableEnergy > 0) {
						instr+= ` You do have ${(this.totalRenewableEnergy).toLocaleString()} renewable energy credits (RECs) that you can exchange for carbon credits, which may help you achieve your carbon goal.`
					}

					return instr
				}
				
			// If you have reached your goal
			} else {
				return `Congratulations! You have accomplished your goal of retiring ${this.carbon_goal} carbon credits.`
			}
		}
	},

	methods: {
		calculatePercentage(quantity) {
			// Calculate the percentage here based on the total quantity
			const totalQuantity = this.assets.reduce((total, asset) => total + asset.amount, 0)
			return Math.round(100 * quantity / totalQuantity)
		},
		renderChart() {
			if (this.$refs.myChart && this.assets && this.assets.length > 0) {
				const ctx = this.$refs.myChart.getContext("2d");
				if (ctx) {
					this.chart = new Chart(ctx, {
						type: "doughnut",
						data: {
							labels: this.assets.map((asset) => asset.name),
							datasets: [
								{
									backgroundColor: [
										"#FF5733",
										"rgb(239, 216, 6)",
										"#ff6d05",
										"rgb(218, 148, 68)",
									], // Add colors as needed
									data: this.assets.map((asset) => asset.amount),
								}
							]
						},
						options: {
							responsive: true,
							maintainAspectRatio: false,
						},
					});
				}
			}
		},
		renderLineChart() {
			if (this.$refs.lineChart && this.activity.length > 0) {
				const yearArray = [];
				const assetsArray = [];
				const assetMap = new Map();
				const assetNumMap = new Map();
				let assetNum = 0;

				// Find number of different assets
				for (let k = 0; k < this.activity.length; k++) {
					if (!assetsArray.includes(this.activity[k].name) && this.activity[k].action == "Generation") {
						assetsArray.push(this.activity[k].name);
						assetMap.set(this.activity[k].name, assetNum);
						assetNumMap.set(assetNum, this.activity[k].name);
						assetNum++;
					}
					if (!yearArray.includes(parseInt(this.activity[k].date.substring(2,4))) && this.activity[k].action == "Generation") {
						yearArray.push(parseInt(this.activity[k].date.substring(2,4)));
					}
				}

				const numAssets = assetsArray.length;

				const xValues = [];
				const yValues = [];

				for (let m = 0; m < numAssets; m++) {
					yValues.push([0]);
				}

				// Generating x values 
				for (let i = yearArray[0]; i < yearArray[0] + yearArray.length + 1; i++) {
					xValues.push(i + 2000);
				}

				// Generating y values by parsing activity data
				for (let j = 0; j < this.activity.length; j++) {
					let tempName = "";
					let tempNum = -1;
					let tempYear = -1;
					if (this.activity[j].action == "Generation") {
						tempName = this.activity[j].name;
						tempNum = assetMap.get(tempName);
						tempYear = parseInt(this.activity[j].date.substring(2,4));
						if (yValues[tempNum][yearArray.indexOf(tempYear)]) {
							yValues[tempNum][yearArray.indexOf(tempYear)] += this.activity[j].amount;
						}
						else {
							yValues[tempNum][yearArray.indexOf(tempYear)] = this.activity[j].amount;
						}
							
					}
				}

				const datasets = [];

				for (let h = 0; h < numAssets; h++) {
					console.log("darin is here");
					console.log(yValues[h]);
					datasets.push({
						data: yValues[h],
						label: assetNumMap.get(h),
						borderColor: 'red',
						fill: false,
					});
				}

				const ctx = this.$refs.lineChart.getContext("2d");
				console.log('ctx is here');
				console.log(ctx);
				//const xValues = [50,60,70,80,90,100,110,120,130,140,150];
				if (ctx) {
					this.lineChart = new Chart(ctx, {
						type: "line",
						data: {
							labels: xValues,
							datasets: datasets,
						},
						options: {
							plugins: {
								legend: {
									position: 'right',
									labels: {
										padding: 20,
										color: '#292929',
										font: {
											size: 16
										}
									}
								},
								title: {
									display: true,
									text: 'Asset Generation Over Time',
									position: 'top',
									color: '#292929',
									align: 'center',
									font: {
										size: 18
									}
								}
							},
							scales: {
								y: {
									grid: {
										color: '#292929'
									},
									ticks: {
										color: '#292929',
										font: {
											size: 16
										}
									}
								},
								x: {
									grid: {
										color: '#292929'
									},
									ticks: {
										color: '#292929',
										font: {
											size: 16
										}
									}
								}
							}
						},
					});
				}
			}
		}
	},
});

app.mount("#app");