// const puppeteerLV2 = require('./puppeterLibV2');
const scraper = require ('./puppeterLibV2');
/*async function scraperRun(recipe, param, options) {
    let res = await puppeteerLV2.run(recipe,param,options);
    return res;
}*/

module.exports = {
    scraperRun: async(recipe,param,options)=>{
        console.log("scraper", scraper);
        let res = await scraper.run(recipe,param,options);
        return res;
    }
} 

