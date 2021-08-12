// const puppeteerLV2 = require('./puppeterLibV2');
import scraper from '../puppeterLibV2';
/*async function scraperRun(recipe, param, options) {
    let res = await puppeteerLV2.run(recipe,param,options);
    return res;
}*/
module.exports = {
    scraperRun: async(recipe,param,options)=>{
        let res = await scraper.run(recipe,param,options);
        return res;
    }
} 