const puppeteerNew = require('puppeteerAlt-10');
const util = require('util')
/****
 * VERSION 2.0.8;
 * 
 */
const scraper = {
    params: [],
    result: [],
    headless: true,
    endClose: true,
    devTools: false,
    options: [],
    /**
     *
     * @param recipe
     * @param param
     * @param options
     * @param options.headless
     * @param options.endClose
     * @param options.devTools
     * @return {*}
     */
    async run(recipe, param, options={}) { //run this
        console.log("START********************************************************")
        let steps =[];
        this.options =options;
        this.params = param;

        if(this.options.hasOwnProperty("preRun") && this.options.preRun != null) {
            steps = [...steps, ...this.options.preRun];
        }

        //validar Receta
        
        let recipeTest = await this.checkRecipe(recipe);
        // console.log("RECIPE TEST:",recipeTest);
        if (!recipeTest) {
            console.log("Invalid recipe 1");
            return;
        }
        let urls = await this.getUrls(recipeTest);
        if (!urls) {
            console.log("Invalid recipe urls");
            return;
        }
    
        //segun tipo / convertir
        if(recipeTest["startUrl"]){
            // console.log("hay");
            recipeTest = await this.webScraperToPuppeteer(recipeTest);                        
        }else{
            recipeTest = recipeTest.steps;
        }
        steps  = [...steps, ...recipeTest];
        //  console.log(util.inspect({"sp":steps}, false, null, true /* enable colors */));
        //  return [];
        //  console.log("recipeTest:", steps);
        //  return;
        // iniciar browser 
        let browser = await this.startBrowser();
        // scrapear por cada pagina
        for(let url of urls){
            // check paginador por url
            await this.scrape(browser, url,steps);
        }
        let close = this.endClose;
        if(this.options.hasOwnProperty("endClose")){
            close = this.options.endClose;
        }
        if (close) {
            browser.close();
        }
        return this.result;
    },
    async webScraperToPuppeteer(recipeTest){
        let selectors= recipeTest.selectors;
        // console.log("ss;", selectors);
        let selectorsByKey = [];
        // los ordeno por key
        for(let selector of selectors){
            selector.childs=[];
            selectorsByKey[selector.id]=selector;
        }
        // marco el padre;
        let parents = [];
        for(let selector of selectors){
            // parents =selector.parentSelectors;
            // console.log("parent found","selector",selector.id,parents)
            if(selector.parentSelectors.includes("_root")){
                // console.log("root", selector.id);
                parents.push(selector.id);  
            }/*else{
            //     console.log("no: ",selector.id);
            // }*/
        }
        // console.log("parents:",parents);return [];
        if(parents.length == 0){
            console.log("fallo encontrar padre");
            return false;
        }
        
        for(let selector of selectors){
            let father =selector.parentSelectors[0];
            if(father != '_root'){
                selectorsByKey[father].childs.push(selector);
            }
        }
        
        let fullOrder=[];
        for(let parent of parents){
            fullOrder.push(selectorsByKey[parent]);
        }
        // console.log("FO",fullOrder)
        steps = await this.translateWSTS(fullOrder);
        // return [];
        // console.log(util.inspect({"sp":steps}, false, null, true /* enable colors */));
        return steps;
    },
    async translateWSTS(FO){
        let steps = [];
        let stepGetValue ={};
        let MultiParent = false;
        if(FO.length>1){ //se toman mucho de root
            MultiParent = true;
            stepGetValue.fn="getValues";
            stepGetValue.field= null
            stepGetValue.type= "element";
            stepGetValue.final= true;
            stepGetValue.elements=[];
        }
        // define los tipos de elemtnos que realizan accion y ademas son wrappers
        let stepsActionAndElementContainer = ["SelectorElementClick"];
        if(MultiParent){
            for(let F of FO){
                let element =null;
                if(F.childs.length>0){//tiene hijos
                    if(stepsActionAndElementContainer.includes(F.type)){
                        // console.log("agrega paso");
                        steps.push(await this.convert(F,"step"));
                    }
                    let s = {fn:"getValues",type:"element",selector:F.selector,elements:[]};
                    for(let child of F.childs){
                        if(child.childs.length>0){
                            console.log("CAGAMOS hay child con child");
                        }
                        element = await this.convert(child,"element",null);//F.selector
                        s.elements.push(element);
                    }
                    stepGetValue.elements.push(s);
                }else{
                    element = await this.convert(F);
                    stepGetValue.elements.push(element);
                }
                // console.log("F",F);
            }
            steps.push(stepGetValue);
        }else{        
            for(let sel of FO){
                console.log(sel);
                if(stepsActionAndElementContainer.includes(sel.type)){
                    // console.log("agrega paso");
                    steps.push(await this.convert(sel,"step"));
                }
                let step = await this.convert(sel);
                if(sel.childs.length > 0){
                    for(let ch of sel.childs){
                        step.elements.push(await this.convert(ch));
                    }
                }
                steps.push(step);
                // console.log(sel);
            }
        }
        
        return steps;
    },
    async convert(f,t="element",parent_selector =null){
        let step ={};
        if(t=="step"){
            switch(f.type){
                case "SelectorElementClick":
                    step.fn = 'waitLoadMore';
                    step.field = f.clickElementSelector;
                    // step.delay = f.delay;
                break;
                default:
                    console.log(f.type, "not defined 1");
            }
        }else{
            
            let stepsActionAndElementContainer = ["SelectorElementClick","SelectorElement"];
            if(stepsActionAndElementContainer.includes(f.type)){
                switch(f.type){
                    case "SelectorElement":
                        step.fn="getValues";
                        step.field= f.selector;
                        step.type= "element";
                        step.final= true;
                        step.elements=[];
                        break;
                    case "SelectorElementClick":
                        step.fn="getValues";
                        step.field= f.selector;
                        step.type= "element";
                        step.final= true;
                        step.elements=[];
                    break;
                }
            }else{
                step.name = f.id;
                if(parent_selector == null){
                    step.selector = f.selector;
                }else{
                    step.selector = parent_selector+' > '+f.selector;
                }
                switch(f.type){                
                    case "SelectorText":
                        if(f.regex.length>0){
                            step.regExp = f.regex;
                        }
                        step.type = "getContent";
                    break;
                    case "SelectorImage":
                        if((f["regex"])&&f.regex.length>0){
                            step.regExp = f.regex;
                        }
                        step.type = "getAttribute";
                        step.attribute = "src"
                    break;
                    case "SelectorLink":
                        if((f["regex"])&&f.regex.length>0){
                            step.regExp = f.regex;
                        }
                        step.type = "getAttribute";
                        step.attribute = "href";
                    break;
                    case "SelectorElementAttribute":
                        if((f["regex"])&&f.regex.length>0){
                            step.regExp = f.regex;
                        }
                        step.type = "getAttribute";
                        step.attribute = f.extractAttribute;
                    break;
                    
                    default:
                        console.log(f.type, "not defined 2");
                }
            }
        }
        return step;
    },

    async getUrls(recipe){
        let purl = recipe.url || recipe.startUrl;
        // console.log(purl);
        let n_urls= [];
        if(Array.isArray(purl)){
            for(let url of purl){
                if(url.search(/\$TERM/) >0){
                    key = "$TERM";
                    let term = await this.getValueParam("term");                    
                    url = url.replace(key, term);
                    if(url.search(/\$TERM/) >0){
                        url = url.replace(key, term);
                    }                    
                }else if(url == "$TERM"){
                    key = "$TERM";
                    let term = await this.getValueParam("term");                    
                    url = term;
                }
                n_urls.push(url);
            }        
        }else{
            if(purl.search(/\$TERM/) >0){
                key = "$TERM";
                let term = await this.getValueParam("term");
                purl = purl.replace(key, term);
                if(purl.search(/\$TERM/) >0){
                    purl = purl.replace(key, term);
                }
            }else if(url == "$TERM"){
                key = "$TERM";
                let term = await this.getValueParam("term");                    
                url = term;
            }
            n_urls.push(purl);
        }
        return n_urls;
    },
    async scrape(browser, url, recipe) {
        
        let page = await browser.newPage();
        await page.setViewport({ width: 1250, height: 1000 });
        
        console.log("Navigatin to ... ",url);
        await page.goto(url, { waitUntil: "load" });
        // await page.waitForNavigation({ waitUntil: 'networkidle0'});
        let steps = recipe;
        let steps_length = steps.length;
        let items=[];
        let url_scraped=[];
        for (let i = 0; i < steps_length; i++) {
            // console.log("i:", i);
            let step = steps[i];
            let value;
            if (step["final"] && step.final) {
                console.log("is Final");
                value = await this.scrapeStep(page, step);
                if(value.items){
                    console.log("VALUE: ",value.items.length);
                }
                // console.log("BANCAAAAA :",value);
                items = [...value.items, ...items];
                if(value.hasOwnProperty("url_scraped")){
                    url_scraped.push(value.url_scraped);
                }
            } else {
                console.log("not Final");
                await this.scrapeStep(page, step);
            }
        }
        this.result["items"]=items;
        this.result["url_scraped"]=url_scraped
        await this.test(page);
        let close = this.endClose;
        if(this.options.hasOwnProperty("endClose")){
            close = this.options.endClose;
        }
        if (close) {
            await page.close();
        }
    },
    async test(page){
        // console.log("TEST-->");
        // can use for test code
    },
    async getValueParam(param) {
        if(!this.params[param]){
            console.log("param not found");
        }
        return this.params[param];
    },
    async getFromShadowRoot(page, step) {
        // let selector = step.field;
        const jsh = await page.evaluateHandle((step) => {
            let dr = eval(step.field);
            return dr;
        }, step);

        const result = await page.evaluate((jsh, step) => {
            let x = [];
            for (let item of jsh) {
                let i = {};
                i[step.name] = item.textContent;
                x.push(i);
            }
            return x;
        }, jsh, step);
        return result;
    },
    async scrapeStep(page, step) {
        // console.log(step.fn, ": field: ", step.field, " value : ", step.value, "for :",step.for);
        switch (step.fn) {
            case "complete":
                val = await this.getValueParam(step.value)
                // if (step["type"]) {
                //     if (step.type == "JSPath") {
                //         let input = page.evaluateHandle(step.field);
                //         await input.focus();
                //         await input.type(val);
                //     }
                // } else {
                    await page.type(step.field, val);
                // }
                // if (SCRAPER_DEBUG) {
                //     await page.screenshot({ path: "img/img1.png" });
                // }
                return false;
                break;
            case "wait":
                if (step["field"]) {
                    await page.waitForSelector(step.field);
                }
                if (step["for"]) {
                    await page.waitForTimeout(step.for);
                }
                if (step["network0"]) {
                    await page.waitForNavigation({ waitUntil: ['networkidle0'] })
                }
                if (step["network2"]) {
                    await page.waitForNavigation({ waitUntil: ['networkidle2'] })
                }
                // if (SCRAPER_DEBUG) {
                //     await page.screenshot({ path: "img/img2.png" });
                // }
                return false;
                break;
            case "item":
                console.log("ITEM STEP:", step);
                break;
            // case "getFromShadowRoot":
            //     return await this.getFromShadowRoot(page,step);
            case "goto":
                //TODO si se quiere hacer un goto sin param que se pueda
                let url = step.url +await this.getValueParam(step.value)
                await page.goto(url, { waitUntil: "load" });
                // await page.goto(url);
                break;
            case "getValue":
                switch (step.type) {
                    case "text":
                        selector = step.field;
                        values = await page.$eval(selector, (items, step) => {
                            console.log("STEP: ", step);
                            console.log("ITEM: ", items);
                            let res = [];
                            items.forEach(function (item) {
                                let f = {};
                                f[step.name] = item.textContent;
                                res.push(f);
                            });
                            return res;
                        }, step);
                        return values;
                        break;
                    case "element":
                        let selector = step.field;
                        console.log("x 1: ", step);
                        // console.log("x 1 page: ",page);
                        let value = await page.$eval(selector, (item) => item);
                        console.log("x 2");

                        // console.log("ELEMENT VALUE: ",value)  ;
                        console.log("x 3");
                        if (step["return"]) {
                            if (step.return) {
                                return value;
                            }
                        }
                        break;
                    default:
                        console.log("not defined: ", step);
                }

                break;
            case "getValues":
                // console.log("getValues");
                switch (step.type) {
                    case "text":
                        let selector;
                        if (step.field["complex"]) {
                            selector = step.field.complex.first;
                        } else {
                            selector = step.field;
                        }
                        let values = await page.$$eval(selector, (items, step) => {
                            if (step.field["complex"]) {

                            }
                            console.log("STEP: ", step);
                            console.log("ITEM: ", items);
                            let res = [];
                            items.forEach(function (item) {
                                let f = {};
                                f[step.name] = item.textContent;
                                res.push(f);
                            });
                            return res;
                        }, step);
                        return values;
                    case "JSPath":
                        const SR = await (await page.evaluateHandle(step.field)).asElement();
                        console.log("SR:", $(SR).querySelectorAll("#header-store-type-container > ul > li > p"));
                        console.log("VARIOS:", varios)
                        // button.click();
                        break;
                    case "getFromShadowRoot":
                        let val = await this.getFromShadowRoot(page, step);
                        console.log("VAL:", val);
                        return val;
                        break;
                    case "element":
                        let el_values = await this.getValuesElement(page, step);
                        // console.log("VAL:", el_values);
                        return el_values;
                        break;
                    default:
                        console.log("not defined 2: ", step);
                }
                break;
            case "click":
                let selector = null;
                switch (step.type) {
                    case "text":
                        selector = step.field;

                        if (step["choice"]) {
                            let choice = step.choice;
                            val = await this.getValueParam(step.value)
                            switch (choice.type) {
                                case "number":
                                    selector = step.field + ":nth-child(" + val + ")";
                                    break;
                                case "text":
                                    key = step.key;
                                    selector = step.field.replace(key,val);
                                    break;
                            }
                        }
                        await page.click(selector);
                        break;
                    case "button":
                        selector = step.field;
                        await page.click(selector);
                        if (step["wait"]) {
                            await page.waitForNavigation(step.wait);
                        }
                        break;
                    case "buttonJSPath":
                        selector_parts = false;
                        if (step["field"]) {
                            selector = step.field;
                        }
                        if (step["field_parts"]) {
                            selector_parts = step.field_parts;
                        }
                        if (step["choice"]) {
                            let choice = step.choice;
                            val = await this.getValueParam(step.value)
                            switch (choice.type) {
                                case "number":
                                    if (selector_parts) {
                                        selector = selector_parts.start + ":nth-child(" + val + ")" + selector_parts.end;
                                    } else {
                                        selector = step.field + ":nth-child(" + val + ")";
                                    }
                                    break;
                            }
                        }
                        const button = await (await page.evaluateHandle(selector)).asElement();
                        button.click();
                        break;
                }
                break;
            case "scroll":
                await this.scrollFNC(page,step);
                break;
            case "waitLoadMore":
                await this.waitLoadMoreStep(page, step);
                // console.log("end");
            break;
        }
    },
    async scrollFNC(page,step){
        await page.evaluate(async step => {
            const scrollableSection = document.querySelector(step.field);
            async function later(delay, value) {
                return new Promise(resolve => setTimeout(resolve, delay, value));
            }
            for(let scroll = 1;scroll< scrollableSection.scrollHeight; scroll+=step.scrollIncrement){
                scrollableSection.scrollTop = scroll;
                console.log("scroll:",scroll);
                await later(step.delay);
            }
            
        }, step);
    },
    async waitLoadMoreStep(page,step){        
        const isElementVisible = async (page, cssSelector) => {
            let visible = true;
            await page
              .waitForSelector(cssSelector, { visible: true, timeout: 2000 })
              .catch(() => {
                visible = false;
              });
            return visible;
          };
         let loadMoreVisible = await isElementVisible(page, step.field);

        while (loadMoreVisible) {
            // console.log("btn:",loadMoreVisible);
            await page
                .click(step.field)
                .catch(() => {});
            loadMoreVisible = await isElementVisible(page, step.field);
            }
        return;
    },
    async getValuesElement(page,step){
        // let fnc = this.returnValue2;
        let result = [];
        // console.log("s:1")
        if(step.field == null){
            for(let element of step.elements){
                let r = [];
                if(element.type == "element"){
                    r = await this.scrapPure(page,element);
                    // console.log("s:2",r)
                }else{
                    r = await this.scrapPure(page,element);
                    // console.log("s:3",r)
                }
                // console.log("X---->")
                result = await this.merge(result,r);
                // console.log("RESULT:",result);
            }
        }else{
            result = await this.scrapPure(page,step);
        }
        // result.url = await page.url();
        // console.log("outside:", result);
        return result;
    },
    async merge(RES,R0){
        // console.log("RES",RES);
        // console.log("R0",R0);
        let rg= [];
        let items = [];
        if(!RES["items"]){
            for(let x of R0.items){
                items.push(x);
            }
        }
        if(RES["items"] && RES.items.length>0 && R0["items"] && R0.items.length==0){
            for(let rr of RES.items){
                items.push(rr);
            }
        }
        if(RES["items"] && RES.items.length>0 && R0["items"] && R0.items.length>0){
            for(let rr of RES.items){
                for(let gg of R0.items){
                    let t = {...gg,...rr};
                    items.push(t);
                }
            }
        }/*else{
            console.log("EU");
            console.log("EU RES: ",RES)
            console.log("EU R0: ",R0)
        }*/
        rg["items"]=items;
        rg["url_scraped"]=RES["url_scraped"]||R0["url_scraped"];
        return rg;
    },

    async scrapPure(page, step){
        let result = await page.$$eval(step.selector, (elements,step) => {
            function returnValue(elem, field){
                let value =null;
                // console.log("elem:",elem);
                try{
                    let elDom;
                    if(field.selector == '__parent'){
                        elDom = elem;
                    }else{
                        elDom = elem.querySelector(field.selector);
                    }
                    switch(field.type){
                        case "getContent":
                            value = elDom ? elDom.textContent : null;
                            break;
                        case "getAttribute":
                            value = elDom ? elDom.getAttribute(field.attribute) : null;
                            // value = elem.querySelector(field.selector).getAttribute(field.attribute);
                            break;
                    }
                    if(value != null && field["regExp"]){
                        let pat = field.regExp;
                        value = value.match(pat)[0];
                    }
                }catch(e){
                    // console.log(e.message, elem, field);
                    value = "error";
                }
                return value;
            }
            // return step;
            let result = [];
            let sresult = {};
            let fixDeep = false;
            let fieldDeep =null;
            let itemNumber = 0;
            // console.log("ELEMENTS:",elements);
            for (let i = 0; i < elements.length; i++) { // por cada store
                let elem = elements[i];
                let element = {};
                element["index_i"]=i;
                if(step.hasOwnProperty("elements")){
                    let fields = step.elements;

                    for (let j = 0; j < fields.length; j++) { // por cada campo
                        let field = fields[j];
                        let value = null;
                        
                        if(field.type == "element"){
                            //muchos 
                            if(!fixDeep){
                                fixDeep=true;
                                fieldDeep =field.name;
                            }
                            let fieldChilds = field.elements;
                            let items = [];
                            let elemChilds = elem.querySelectorAll(field.selector);//todos los productos
                            for(let k = 0; k < elemChilds.length; k++){ // por cada producto
                                let elemC = elemChilds[k];
                                let item = {};
                                itemNumber++;
                                item["index_j"]=k;
                                item["screenPosition"]=itemNumber;
                                for(let fieldC of fieldChilds){ //cada elemento buscado
                                    let value2=null;
                                    value2=returnValue(elemC, fieldC);
                                    item[fieldC.name]=value2;
                                }
                                items.push(item);
                            }
                            element[field.name]=items;
                            // let x = otracosa(field.name);
                            // console.log("x: ",x );
                        }else{
                            value = returnValue(elem,field);
                            console.log("log",value);
                            element[field.name]=value;
                        }
                        
                    }  
                              
                result.push(element);
                }else{
                    // console.log("ELEMENT:",element)
                    // console.log("ELEM:",elem);
                    // console.log("STEP:",step);
                    step.selector = '__parent';
                    value2=returnValue(elem, step);
                    // console.log("val2:",value2)
                    element[step.name]=value2;
                    result.push(element);
                }
            }
            // console.log("ELEM: ",result);
            // console.log("STEP:",step)
            let resultado = {};
            // console.log("FXD :",fixDeep);
            if(fixDeep){
                console.log("FXD T");
                let nresult=[];
                for(let res of result){
                    keys = Object.keys(res);
                    let nres = {};
                    for(let key of keys){
                        if(key != fieldDeep){
                            nres[key]=res[key];
                        }
                    }
                    if(res[fieldDeep]){
                        let its = res[fieldDeep];
                        for(let it of its ){
                            let nit = {...it, ...nres};
                            console.log("NIT:",nit);
                            nresult.push(nit);
                        }
                    }
                }
                resultado["items"]=nresult;
            }else{
                // console.log("FXD F");
                // console.log("FXD R",sresult);
                resultado["items"]=result;
            }
            
            // console.log("RESULTADO:",resultado)
            return resultado;
        },step);
        // console.log("RESULTTTT:",result);
        result["url_scraped"]=await page.url();
        return result
    },
    
    async checkRecipe(recipe) {

        if (await this.checkItemType(recipe, 'json')) {
            // console.log("json");
            if(recipe["_id"]){
                console.log("tiene id");
            }
            if (!recipe["url"] && !recipe["startUrl"]) {
                console.log("not have url");
                return false;
            }
            return recipe;
        } else {
            // console.log("string");
            if (await this.checkItemType(recipe, 'string')) {
                try {
                    let nrecipe = JSON.parse(recipe);
                    // console.log("NRECIPE:",nrecipe);
                    if(nrecipe["_id"]){
                        // console.log("tiene id");
                    }
                    if (!nrecipe["url"] && !nrecipe["startUrl"]) {
                        console.log("not have url");
                        return false;
                    }
                    return nrecipe;
                } catch (e) {
                    return false;
                }
            } else {
                return false;
            }
        }
        //can add more recipe controlls
    },
    async checkItemType(item, type) {
        switch (type.toUpperCase()) {
            case "STRING":
                return typeof item === "string" ? true : false;
            case "JSON":
                if (typeof item === "object") {
                    return true;
                } else {
                    return false;
                }
        }
    },
    async startBrowser() {
        let browser;
        try {
            console.log("Opening the browser......");
            // console.log("OPT:",this.options);
            let head = this.headless;
            let dev = this.devTools;
            if(this.options.hasOwnProperty("headless")){
                head = this.options.headless;
            }
            if(this.options.hasOwnProperty("devTools")){
                dev = this.options.devTools;
            }
            console.log("headless: ",head, " devtools: ",dev);
            browser = await puppeteerNew.launch({
                headless: head,
                devtools: dev,
                args: ["--disable-setuid-sandbox", "--no-sandbox"],
                'ignoreHTTPSErrors': true
            });
        } catch (err) {
            console.log("Could not create a browser instance => : ", err);
        }
        return browser;
    }
}

module.exports = scraper;