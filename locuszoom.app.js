!function() {
    try {

        // Verify that the two third-party dependencies are met: d3 and Q
        var minimum_d3_version = "3.5.6";
        if (typeof d3 != "object"){
            throw("LocusZoom unable to load: d3 dependency not met. Library missing.");
        } else if (d3.version < minimum_d3_version){
            throw("LocusZoom unable to load: d3 dependency not met. Outdated version detected.\nRequired d3 version: " + minimum_d3_version + " or higher (found: " + d3.version + ").");
        }
        if (typeof Q != "function"){
            throw("LocusZoom unable to load: Q dependency not met. Library missing.");
        }
        
        /* global d3,Q,LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

var LocusZoom = {
    version: "0.1"
};

// Object for storing key-indexed Instance objects
LocusZoom._instances = {};

// Create a new instance by instance class and attach it to a div by ID
// NOTE: if no InstanceClass is passed then the instance will use the Intance base class.
//       The DefaultInstance class must be passed explicitly just as any other class that extends Instance.
LocusZoom.addInstanceToDivById = function(id, datasource, layout, state){
    // Initialize a new Instance
    var inst = LocusZoom._instances[id] = new layout(id, datasource, layout, state);
    // Add an SVG to the div and set its dimensions
    inst.svg = d3.select("div#" + id)
        .append("svg").attr("id", id + "_svg").attr("class", "lz-locuszoom");
    inst.setDimensions();
    // Initialize all panels
    inst.initialize();
    // Detect data-region and map to it if necessary
    if (typeof inst.svg.node().parentNode.dataset !== "undefined"
        && typeof inst.svg.node().parentNode.dataset.region !== "undefined"){
        var region = inst.svg.node().parentNode.dataset.region.split(/\D/);
        inst.mapTo(+region[0], +region[1], +region[2]);
    }
    return inst;
}
    
// Automatically detect divs by class and populate them with default LocusZoom instances
LocusZoom.populate = function(selector, datasource, layout, state) {
    if (typeof selector === "undefined"){
        selector = ".lz-instance";
    }
    if (typeof layout === "undefined"){
        layout = LocusZoom.DefaultInstance;
    }
    if (typeof state === "undefined"){
        state = {};
    }
    var instance;
    d3.select(selector).each(function(){
        instance = LocusZoom.addInstanceToDivById(this.id, datasource, layout, state);
    });
    return instance;
};

LocusZoom.populateAll = function(selector, datasource, layout, state) {
    var instances = [];
    d3.selectAll(selector).each(function(d,i) {
        instances[i] = LocusZoom.populate(this, datasource, layout, state);
    });
    return instances;
};

// Format a number as a Megabase value, limiting to two decimal places unless sufficiently small
LocusZoom.formatMegabase = function(p){
    var places = Math.max(6 - Math.floor((Math.log(p) / Math.LN10).toFixed(9)), 2);
    return "" + (p / Math.pow(10, 6)).toFixed(places);
};

//parse numbers like 5Mb and 1.4kB 
LocusZoom.parsePosition = function(x) {
    var val = x.toUpperCase();
    val = val.replace(",","");
    var suffixre = /([KMG])[B]*$/;
    var suffix = suffixre.exec(val);
    var mult = 1;
    if (suffix) {
        if (suffix[1]=="M") {
            mult = 1e6;
        } else if (suffix[1]=="G") {
            mult = 1e9;
        } else {
            mult = 1e3; //K
        }
        val = val.replace(suffixre,"");
    }
    val = Number(val) * mult;
    return val;
}

// Parse region queries that look like
// chr:start-end
// chr:center+offset
// chr:pos
// TODO: handle genes (or send off to API)
LocusZoom.parsePositionQuery = function(x) {
    var chrposoff = /^(\w+):([\d,.]+[kmgbKMGB]*)([-+])([\d,.]+[kmgbKMGB]*)$/;
    var chrpos = /^(\w+):([\d,.]+[kmgbKMGB]*)$/;
    var match = chrposoff.exec(x);
    if (match) {
        if (match[3] == "+") {
            var center = LocusZoom.parsePosition(match[2]);
            var offset = LocusZoom.parsePosition(match[4]);
            return {chr:match[1], start:center-offset, end:center+offset};
        } else {
            return {chr:match[1], start:LocusZoom.parsePosition(match[2]), end:LocusZoom.parsePosition(match[4])};
        }
    }
    match = chrpos.exec(x);
    if (match) {
        return {chr:match[1], position:LocusZoom.parsePosition(match[2])};
    };
    return null;
}

// Generate a "pretty" set of ticks (multiples of 1, 2, or 5 on the same order of magnitude for the range)
// Based on R's "pretty" function: https://github.com/wch/r-source/blob/b156e3a711967f58131e23c1b1dc1ea90e2f0c43/src/appl/pretty.c
// Optionally specify n for a "target" number of ticks. Will not necessarily be the number of ticks you get! Defaults to 5.
LocusZoom.prettyTicks = function(range, n, internal_only){
    if (typeof n == "undefined" || isNaN(parseInt(n))){
  	    n = 5;
    }
    n = parseInt(n);
    if (typeof internal_only == "undefined"){
        internal_only = false;
    }
    
    var min_n = n / 3;
    var shrink_sml = 0.75;
    var high_u_bias = 1.5;
    var u5_bias = 0.5 + 1.5 * high_u_bias;
    
    var d = Math.abs(range[0] - range[1]);
    var c = d / n;
    if ((Math.log(d) / Math.LN10) < -2){
        c = (Math.max(Math.abs(d)) * shrink_sml) / min_n;
    }
    
    var base = Math.pow(10, Math.floor(Math.log(c)/Math.LN10));
    var base_toFixed = 0;
    if (base < 1){
        base_toFixed = Math.abs(Math.round(Math.log(base)/Math.LN10));
    }
    
    var unit = base;
    if ( ((2 * base) - c) < (high_u_bias * (c - unit)) ){
        unit = 2 * base;
        if ( ((5 * base) - c) < (u5_bias * (c - unit)) ){
            unit = 5 * base;
            if ( ((10 * base) - c) < (high_u_bias * (c - unit)) ){
                unit = 10 * base;
            }
        }
    }
    
    var ticks = [];
    if (range[0] <= unit){
        var i = 0;
    } else {
        var i = Math.floor(range[0]/unit)*unit;
        i = parseFloat(i.toFixed(base_toFixed));
    }
    while (i < range[1]){
        ticks.push(i);
        i += unit;
        if (base_toFixed > 0){
            i = parseFloat(i.toFixed(base_toFixed));
        }
    }
    ticks.push(i);
    
    if (internal_only){
        if (ticks[0] < range[0]){ ticks = ticks.slice(1); }
        if (ticks[ticks.length-1] > range[1]){ ticks.pop(); }
    }
    
    return ticks;
};

// From http://www.html5rocks.com/en/tutorials/cors/
// and with promises from https://gist.github.com/kriskowal/593076
LocusZoom.createCORSPromise = function (method, url, body, timeout) {
    var response = Q.defer();
    var xhr = new XMLHttpRequest();
    if ("withCredentials" in xhr) {
        // Check if the XMLHttpRequest object has a "withCredentials" property.
        // "withCredentials" only exists on XMLHTTPRequest2 objects.
        xhr.open(method, url, true);
    } else if (typeof XDomainRequest != "undefined") {
        // Otherwise, check if XDomainRequest.
        // XDomainRequest only exists in IE, and is IE's way of making CORS requests.
        xhr = new XDomainRequest();
        xhr.open(method, url);
    } else {
        // Otherwise, CORS is not supported by the browser.
        xhr = null;
    }
    if (xhr) {
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200 || xhr.status === 0 ) {
                    response.resolve(JSON.parse(xhr.responseText));
                } else {
                    response.reject("HTTP" + xhr.status + " for " + url);
                }
            }
        };
        timeout && setTimeout(response.reject, timeout);
        body = typeof body !== "undefined" ? body : "";
        xhr.send(body);
    } 
    return response.promise;
};

/* global LocusZoom,Q */
/* eslint-env browser */
/* eslint-disable no-unused-vars */

"use strict";

/* A named collection of data sources used to draw a plot*/
LocusZoom.DataSources = function() {
    this.sources = {};
};

LocusZoom.DataSources.prototype.addSource = function(ns, x) {
    function findKnownSource(x) {
        if (!LocusZoom.KnownDataSources) {return null;}
        for(var i=0; i<LocusZoom.KnownDataSources.length; i++) {
            if (!LocusZoom.KnownDataSources[i].SOURCE_NAME) {
                throw("KnownDataSource at position " + i + " does not have a 'SOURCE_NAME' static property");
            }
            if (LocusZoom.KnownDataSources[i].SOURCE_NAME == x) {
                return LocusZoom.KnownDataSources[i];
            }
        }
        return null;
    }

    if (Array.isArray(x)) {
        var dsclass = findKnownSource(x[0]);
        if (dsclass) {
            this.sources[ns] = new dsclass(x[1]);
        } else {
            throw("Unable to resolve " + x[0] + " data source");
        }
    } else {
        this.sources[ns] = x;
    }
    return this;
};

LocusZoom.DataSources.prototype.getSource = function(ns) {
    return this.sources[ns];
};

LocusZoom.DataSources.prototype.setSources = function(x) {
    if (typeof x === "string") {
        x = JSON.parse(x);
    }
    var ds = this;
    Object.keys(x).forEach(function(ns) {
        ds.addSource(ns, x[ns]);
    });
    return ds;
};

LocusZoom.DataSources.prototype.keys = function() {
    return Object.keys(this.sources);
};

LocusZoom.DataSources.prototype.toJSON = function() {
    return this.sources;
};

LocusZoom.Data = LocusZoom.Data ||  {};


LocusZoom.Data.Requester = function(sources) {

    function split_requests(fields) {
        var requests = {};
        fields.forEach(function(field) {
            var parts = field.split(/\:(.*)/);
            if (parts.length==1) {
                if (typeof requests["base"] == "undefined") {
                    requests.base = {names:[], fields:[]};
                }
                requests.base.names.push(field);
                requests.base.fields.push(field);
            } else {
                if (typeof requests[parts[0]] =="undefined") {
                    requests[parts[0]] = {names:[], fields:[]};
                }
                requests[parts[0]].names.push(field);
                requests[parts[0]].fields.push(parts[1]);
            }
        });
        return requests;
    }
    
    this.getData = function(state, fields) {
        var requests = split_requests(fields);
        var promises = Object.keys(requests).map(function(key) {
            if (!sources.getSource(key)) {
                throw("Datasource for namespace " + key + " not found");
            }
            return sources.getSource(key).getData(state, requests[key].fields, requests[key].names);
        });
        //assume the fields are requested in dependent order
        //TODO: better manage dependencies
        var ret = Q.when({header:{}, body:{}});
        for(var i=0; i < promises.length; i++) {
            ret = ret.then(promises[i]);
        }
        return ret;
    };
};

LocusZoom.Data.Source = function() {};
LocusZoom.Data.Source.prototype.parseInit = function(init) {
    if (typeof init === "string") {
        this.url = init;
        this.params = {};
    } else {
        this.url = init.url;
        this.params = init.params || {};
    }
    if (!this.url) {
        throw("Source not initialized with required URL");
    }

};
LocusZoom.Data.Source.prototype.getRequest = function(state, chain, fields) {
    return LocusZoom.createCORSPromise("GET", this.getURL(state, chain, fields));
};
LocusZoom.Data.Source.prototype.getData = function(state, fields, outnames) {
    return function (chain) {
        return this.getRequest(state, chain, fields).then(function(resp) {
            return this.parseResponse(resp, chain, fields, outnames);
        }.bind(this));
    }.bind(this);
};
LocusZoom.Data.Source.prototype.toJSON = function() {
    return [Object.getPrototypeOf(this).constructor.SOURCE_NAME, 
        {url:this.url, params:this.params}];
};

LocusZoom.Data.AssociationSource = function(init) {
    this.parseInit(init);
    
    this.getData = function(state, fields, outnames) {
        ["id","position"].forEach(function(x) {
            if (fields.indexOf(x)==-1) {
                fields.unshift(x);
                outnames.unshift(x);
            }
        });
        return function (chain) {
            return this.getRequest(state, chain).then(function(resp) {
                return this.parseResponse(resp, chain, fields, outnames);
            }.bind(this));
        }.bind(this);
    };
};
LocusZoom.Data.AssociationSource.prototype = Object.create(LocusZoom.Data.Source.prototype);
LocusZoom.Data.AssociationSource.prototype.constructor = LocusZoom.Data.AssociationSource;
LocusZoom.Data.AssociationSource.prototype.getURL = function(state, chain, fields) {
    var analysis = state.analysis || chain.header.analysis || this.params.analysis || 3;
    return this.url + "results/?filter=analysis in " + analysis  +
        " and chromosome in  '" + state.chr + "'" +
        " and position ge " + state.start +
        " and position le " + state.end;
};
LocusZoom.Data.AssociationSource.prototype.parseResponse = function(resp, chain, fields, outnames) {
    var x = resp.data;
    var records = [];
    fields.forEach(function(f) {
        if (!(f in x)) {throw "field " + f + " not found in response";}
    });
    for(var i = 0; i < x.position.length; i++) {
        var record = {};
        for(var j=0; j<fields.length; j++) {
            record[outnames[j]] = x[fields[j]][i];
        }
        records.push(record);
    }
    var res = {header: chain.header || {}, body: records};
    return res;
};
LocusZoom.Data.AssociationSource.SOURCE_NAME = "AssociationLZ";

LocusZoom.Data.LDSource = function(init) {
    this.parseInit(init);

    this.getData = function(state, fields, outnames) {
        if (fields.length>1) {
            throw("LD currently only supports one field");
        }
        return function (chain) {
            return this.getRequest(state, chain, fields).then(function(resp) {
                return this.parseResponse(resp, chain, fields, outnames);
            }.bind(this));
        }.bind(this);
    };
};
LocusZoom.Data.LDSource.prototype = Object.create(LocusZoom.Data.Source.prototype);
LocusZoom.Data.LDSource.prototype.constructor = LocusZoom.Data.LDSource;
LocusZoom.Data.LDSource.prototype.getURL = function(state, chain, fields) {
    var findSmallestPvalue = function(x, pval) {
        pval = pval || "pvalue";
        var smVal = x[0][pval], smIdx=0;
        for(var i=1; i<x.length; i++) {
            if (x[i][pval] < smVal) {
                smVal = x[i][pval];
                smIdx = i;
            }
        }
        return smIdx;
    };

    var refSource = state.ldrefsource || chain.header.ldrefsource || 1;
    var refVar = fields[0];
    if ( refVar == "state" ) {
        refVar = state.ldrefvar || chain.header.ldrefvar || "best";
    }
    if ( refVar=="best" ) {
        if ( !chain.body ) {
            throw("No association data found to find best pvalue");
        }
        refVar = chain.body[findSmallestPvalue(chain.body)].id;
    }
    if (!chain.header) {chain.header = {};}
    chain.header.ldrefvar = refVar;
    return this.url + "results/?filter=reference eq " + refSource + 
        " and chromosome2 eq '" + state.chr + "'" + 
        " and position2 ge " + state.start + 
        " and position2 le " + state.end + 
        " and variant1 eq '" + refVar + "'" + 
        "&fields=chr,pos,rsquare";
};
LocusZoom.Data.LDSource.prototype.parseResponse = function(resp, chain, fields, outnames) {
    var leftJoin  = function(left, right, lfield, rfield) {
        var i=0, j=0;
        while (i < left.length && j < right.position2.length) {
            if (left[i].position == right.position2[j]) {
                left[i][lfield] = right[rfield][j];
                i++;
                j++;
            } else if (left[i].position < right.position2[j]) {
                i++;
            } else {
                j++;
            }
        }
    };

    leftJoin(chain.body, resp.data, outnames[0], "rsquare");
    return chain;   
};
LocusZoom.Data.LDSource.SOURCE_NAME = "LDLZ";

LocusZoom.Data.GeneSource = function(init) {
    this.parseInit(init);

    this.getData = function(state, fields, outnames) {
        return function (chain) {
            return this.getRequest(state, chain, fields).then(function(resp) {
                return this.parseResponse(resp, chain, fields, outnames);
            }.bind(this));
        }.bind(this);
    };
};
LocusZoom.Data.GeneSource.prototype = Object.create(LocusZoom.Data.Source.prototype);
LocusZoom.Data.GeneSource.prototype.constructor = LocusZoom.Data.GeneSource;
LocusZoom.Data.GeneSource.prototype.getURL = function(state, chain, fields) {
    return this.url + "?filter=source in 1" + 
        " and chrom eq '" + state.chr + "'" + 
        " and start le " + state.end +
        " and end ge " + state.start;
};
LocusZoom.Data.GeneSource.prototype.parseResponse = function(resp, chain, fields, outnames) {
    return {header: chain.header, body: resp.data};
};
LocusZoom.Data.GeneSource.SOURCE_NAME = "GeneLZ";

LocusZoom.createResolvedPromise = function() {
    var response = Q.defer();
    response.resolve(Array.prototype.slice.call(arguments));
    return response.promise;
};

LocusZoom.KnownDataSources = [
    LocusZoom.Data.AssociationSource,
    LocusZoom.Data.LDSource,
    LocusZoom.Data.GeneSource];


/* global LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  LocusZoom.Instance Class

  An instance is an independent LocusZoom object. Many instances can exist simultaneously
  on a single page, each having its own data caching, configuration, and state.

*/

LocusZoom.Instance = function(id, datasource, layout, state) {

    this.id = id;
    this.parent = LocusZoom;
    
    this.svg = null;

    // The _panels property stores child panel instances
    this._panels = {};
    
    // The state property stores any instance-wide parameters subject to change via user input
    this.state = state || {
        chr: 0,
        start: 0,
        end: 0
    };
    
    // The view property contains parameters that define the physical space of the entire LocusZoom object
    this.view = {
        width: 0,
        height: 0
    };

    // LocusZoom.Data.Requester
    this.lzd = new LocusZoom.Data.Requester(datasource);
    
    return this;
  
};

// Set the view dimensions for this instance. If an SVG exists, update its dimensions
LocusZoom.Instance.prototype.setDimensions = function(width, height){
    if (!isNaN(width)){
        this.view.width = Math.max(Math.round(+width),0);
    }
    if (!isNaN(height)){
        this.view.height = Math.max(Math.round(+height),0);
    }
    if (this.svg != null){
        this.svg.attr("width", this.view.width).attr("height", this.view.height);
    }
    return this;
};

// Create a new panel by panel class
LocusZoom.Instance.prototype.addPanel = function(PanelClass){
    if (typeof PanelClass !== "function"){
        return false;
    }
    var panel = new PanelClass();
    panel.parent = this;
    this._panels[panel.id] = panel;
    return this._panels[panel.id];
};

// Call initialize on all child panels
LocusZoom.Instance.prototype.initialize = function(){

    // Create the curtain object with svg element and drop/raise methods
    var curtain_svg = this.svg.append("g")
        .attr("class", "lz-curtain").style("display", "none")
        .attr("id", this.id + ".curtain");
    this.curtain = {
        svg: curtain_svg,
        drop: function(message){
            this.svg.style("display", null);
            if (typeof message != "undefined"){
                this.svg.select("text").selectAll("tspan").remove();
                message.split("\n").forEach(function(line){
                    this.svg.select("text").append("tspan")
                        .attr("x", "1em").attr("dy", "1.5em").text(line);
                }.bind(this));
            }
        },
        raise: function(){
            this.svg.style("display", "none");
        }
    };
    this.curtain.svg.append("rect");
    this.curtain.svg.append("text")
        .attr("id", this.id + ".curtain_text")
        .attr("x", "1em").attr("y", "0em");

    // Initialize all panels
    for (var id in this._panels){
        this._panels[id].initialize();
    }

    return this;

};

// Map an entire LocusZoom Instance to a new region
LocusZoom.Instance.prototype.mapTo = function(chr, start, end){

    // Apply new state values
    // TODO: preserve existing state until new state is completely loaded+rendered or aborted?
    this.state.chr   = +chr;
    this.state.start = +start;
    this.state.end   = +end;

    // Trigger reMap on each Panel
    for (var id in this._panels){
        this._panels[id].reMap();
    }

    return this;
    
};


/******************
  Default Instance
  - During alpha development this class definition can serve as a functional draft of the API
  - The default instance should therefore have/do "one of everything" (however possible)
  - Ultimately the default instance should stand up the most commonly configured LZ use case
*/

LocusZoom.DefaultInstance = function(){

    LocusZoom.Instance.apply(this, arguments);

    this.setDimensions(700,700);
  
    this.addPanel(LocusZoom.PositionsPanel)
        .setOrigin(0, 0)
        .setDimensions(700, 350)
        .setMargin(20, 20, 35, 50);
    this._panels.positions.addDataLayer(LocusZoom.PositionsDataLayer).attachToYAxis(1);
    //this._panels.positions.addDataLayer(LocusZoom.RecombinationRateDataLayer).attachToYAxis(2);

    this.addPanel(LocusZoom.GenesPanel)
        .setOrigin(0, 350)
        .setDimensions(700, 350)
        .setMargin(20, 20, 20, 50);
    this._panels.genes.addDataLayer(LocusZoom.GenesDataLayer);
  
    return this;
  
};

LocusZoom.DefaultInstance.prototype = new LocusZoom.Instance();


/* global LocusZoom,d3 */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  LocusZoom.Panel Class

  A panel is an abstract class representing a subdivision of the LocusZoom stage
  to display a distinct data representation

*/

LocusZoom.Panel = function() { 
    
    this.id     = null;
    this.parent = null;
    this.svg    = null;
    
    this.view = {
        width:  0,
        height: 0,
        origin: { x: 0, y: 0 },
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        cliparea: {
            width: 0,
            height: 0,
            origin: { x: 0, y: 0 }
        }
    };

    this.state = {};
    
    this._data_layers = {};
    this.data_layer_ids_by_z_index = [];
    this.data_promises = [];

    this.axes = {
        x:  { render:        false,
              ticks:         [],
              label:         null },
        y1: { render:        false,
              data_layer_id: null,
              ticks:         [],
              label:         null },
        y2: { render:        false,
              data_layer_id: null,
              ticks:         [],
              label:         null }
    };

    this.xExtent  = null;
    this.y1Extent = null;
    this.y2Extent = null;
    
    this.renderData = function(){};

    this.getBaseId = function(){
        return this.parent.id + "." + this.id;
    };
    
    return this;
    
};

LocusZoom.Panel.prototype.setDimensions = function(width, height){
    if (typeof width  !== "undefined"){ this.view.width  = +width;  }
    if (typeof height !== "undefined"){ this.view.height = +height; }
    this.view.cliparea.width = this.view.width - (this.view.margin.left + this.view.margin.right);
    this.view.cliparea.height = this.view.height - (this.view.margin.top + this.view.margin.bottom);
    return this;
};

LocusZoom.Panel.prototype.setOrigin = function(x, y){
    if (typeof x !== "undefined"){ this.view.origin.x = +x; }
    if (typeof y !== "undefined"){ this.view.origin.y = +y; }
    return this;
};

LocusZoom.Panel.prototype.setMargin = function(top, right, bottom, left){
    if (typeof top    !== "undefined"){ this.view.margin.top    = +top;    }
    if (typeof right  !== "undefined"){ this.view.margin.right  = +right;  }
    if (typeof bottom !== "undefined"){ this.view.margin.bottom = +bottom; }
    if (typeof left   !== "undefined"){ this.view.margin.left   = +left;   }
    this.view.cliparea.width = this.view.width - (this.view.margin.left + this.view.margin.right);
    this.view.cliparea.height = this.view.height - (this.view.margin.top + this.view.margin.bottom);
    this.view.cliparea.origin.x = this.view.margin.left;
    this.view.cliparea.origin.y = this.view.margin.top;
    return this;
};

// Initialize a panel
LocusZoom.Panel.prototype.initialize = function(){

    // Append a container group element to house the main panel group element and the clip path
    var container = this.parent.svg.insert("svg:g", "#" + this.parent.id + "\\.curtain")
        .attr("id", this.getBaseId() + ".panel_container")
        .attr("transform", "translate(" + this.view.origin.x +  "," + this.view.origin.y + ")");
        
    // Append clip path to the parent svg element
    container.append("clipPath")
        .attr("id", this.getBaseId() + ".clip")
        .append("rect")
        .attr("width", this.view.width)
        .attr("height", this.view.height);
    
    // Append svg group for rendering all panel child elements, clipped by the clip path
    this.svg = container.append("g")
        .attr("id", this.getBaseId() + ".panel")
        .attr("clip-path", "url(#" + this.getBaseId() + ".clip)");

    // Append a curtain element with svg element and drop/raise methods
    var panel_curtain_svg = container.append("g")
        .attr("id", this.getBaseId() + ".curtain")
        .attr("clip-path", "url(#" + this.getBaseId() + ".clip)")
        .attr("class", "lz-curtain").style("display", "none");
    this.curtain = {
        svg: panel_curtain_svg,
        drop: function(message){
            this.svg.style("display", null);
            if (typeof message != "undefined"){
                this.svg.select("text").selectAll("tspan").remove();
                message.split("\n").forEach(function(line){
                    this.svg.select("text").append("tspan")
                        .attr("x", "1em").attr("dy", "1.5em").text(line);
                }.bind(this));
            }
        },
        raise: function(){
            this.svg.style("display", "none");
        }
    };
    this.curtain.svg.append("rect");
    this.curtain.svg.append("text")
        .attr("id", this.id + ".curtain_text")
        .attr("x", "1em").attr("y", "0em");

    // Initialize child Data Layers
    for (var id in this._data_layers){
        this._data_layers[id].initialize();
    }

    // Initialize Axes
    if (this.axes.x.render){
        this.state.x_scale = d3.scale.linear().domain([0,1]).range([0, this.view.cliparea.width]);
        this.state.x_axis  = d3.svg.axis().scale(this.state.x_scale).orient("bottom");
        this.svg.append("g")
            .attr("class", "lz-x lz-axis")
            .attr("transform", "translate(" + this.view.margin.left + "," + (this.view.height - this.view.margin.bottom) + ")")
            .call(this.state.x_axis);
    }
    if (this.axes.y1.render){
        this.state.y1_scale = d3.scale.linear().domain([0,1]).range([this.view.cliparea.height, 0]).nice();
        this.state.y1_axis  = d3.svg.axis().scale(this.state.y1_scale).orient("left");
        this.svg.append("g")
            .attr("class", "lz-y lz-y1 lz-axis")
            .attr("transform", "translate(" + this.view.margin.left + "," + this.view.margin.top + ")")
            .call(this.state.y1_axis);
    }
    if (this.axes.y2.render){
        this.state.y2_scale = d3.scale.linear().domain([0,1]).range([this.view.cliparea.height, 0]).nice();
        this.state.y2_axis  = d3.svg.axis().scale(this.state.y2_scale).orient("right");
        this.svg.append("g")
            .attr("class", "lz-y lz-y2 lz-axis")
            .attr("transform", "translate(" + (this.view.width - this.view.margin.right) + "," + this.view.margin.top + ")")
            .call(this.state.y2_axis);
    }

    return this;
    
};


// Create a new data layer by data layer class
LocusZoom.Panel.prototype.addDataLayer = function(DataLayerClass){
    if (typeof DataLayerClass !== "function"){
        return false;
    }
    var data_layer = new DataLayerClass();
    data_layer.parent = this;
    this._data_layers[data_layer.id] = data_layer;
    this.data_layer_ids_by_z_index.push(data_layer.id);
    return this._data_layers[data_layer.id];
};


// Re-Map a panel to new positions according to the parent instance's state
LocusZoom.Panel.prototype.reMap = function(){
    try {
        this.data_promises = [];
        // Trigger reMap on each Data Layer
        for (var id in this._data_layers){
            this.data_promises.push(this._data_layers[id].reMap());
        }
        // When all finished trigger a render
        Q.all(this.data_promises).then(function(){
            this.render();
        }.bind(this));
    } catch (error){
        this.curtain.drop(error);
    }
    return this;
};


// Render a given panel
LocusZoom.Panel.prototype.render = function(){  

    // Generate extents and scales.
    if (typeof this.xExtent == "function"){
        this.state.x_extent = this.xExtent();
        this.axes.x.ticks = LocusZoom.prettyTicks(this.state.x_extent, this.view.cliparea.width/120, true);
        this.state.x_scale = d3.scale.linear()
            .domain([this.state.x_extent[0], this.state.x_extent[1]])
            .range([0, this.view.cliparea.width]);
    }
    // Pad out y scales for pretty ticks, regardless of axis rendering
    if (typeof this.y1Extent == "function"){
        this.state.y1_extent = this.y1Extent();
        this.axes.y1.ticks = LocusZoom.prettyTicks(this.state.y1_extent);
        this.state.y1_scale = d3.scale.linear()
            .domain([this.axes.y1.ticks[0], this.axes.y1.ticks[this.axes.y1.ticks.length-1]])
            .range([this.view.cliparea.height, 0]);
    }
    if (typeof this.y2Extent == "function"){
        this.state.y2_extent = this.y2Extent();
        this.axes.y2.ticks = LocusZoom.prettyTicks(this.state.y2_extent);
        this.state.y2_scale = d3.scale.linear()
            .domain([this.axes.y2.ticks[0], this.axes.y1.ticks[this.axes.y2.ticks.length-1]])
            .range([this.view.cliparea.height, 0]);
    }

    // Render axes and labels
    if (this.axes.x.render){
        this.state.x_axis = d3.svg.axis()
            .scale(this.state.x_scale)
            .orient("bottom")
            .tickValues(this.axes.x.ticks)
            .tickFormat(function(d) { return LocusZoom.formatMegabase(d); });
        this.svg.selectAll("g .lz-x.lz-axis").call(this.state.x_axis);
        if (this.axes.x.label != null){
            var x_label = this.axes.x.label;
            if (typeof this.axes.x.label == "function"){
                x_label = this.axes.x.label();
            }
            if (this.svg.select("text.lz-x.lz-axis.lz-label")[0][0] == null){
                this.svg.select("g .lz-x.lz-axis").append("text")
                    .attr("class", "lz-x lz-axis lz-label")
                    .attr("text-anchor", "middle")
                    .attr("x", this.view.cliparea.width / 2)
                    .attr("y", 33);
            }
            this.svg.select("text.lz-x.lz-axis.lz-label").text(x_label);
        }
    }

    if (this.axes.y1.render){
        this.state.y1_axis = d3.svg.axis().scale(this.state.y1_scale)
            .orient("left").tickValues(this.axes.y1.ticks);
        this.svg.selectAll("g .lz-y.lz-y1.lz-axis").call(this.state.y1_axis);
        if (this.axes.y1.label != null){
            var y1_label = this.axes.y1.label;
            if (typeof this.axes.y1.label == "function"){
                y1_label = this.axes.y1.label();
            }
            if (this.svg.select("text.lz-y1.lz-axis.lz-label")[0][0] == null){
                this.svg.select("g .lz-y1.lz-axis").append("text")
                    .attr("class", "lz-y1 lz-axis lz-label")
                    .attr("text-anchor", "middle")
                    .attr("transform", "rotate(-90 " + -28 + "," + (this.view.cliparea.height / 2) + ")")
                    .attr("x", -28)
                    .attr("y", this.view.cliparea.height / 2);
            }
            this.svg.select("text.lz-y1.lz-axis.lz-label").text(y1_label);
        }
    }

    if (this.axes.y2.render){
        this.state.y2_axis  = d3.svg.axis().scale(this.state.y2_scale)
            .orient("left").tickValues(this.axes.y2.ticks);
        this.svg.selectAll("g .lz-y.lz-y2.lz-axis").call(this.state.y2_axis);
    }
    
    // Render data layers by z-index
    for (var z_index in this.data_layer_ids_by_z_index){
        if (this.data_layer_ids_by_z_index.hasOwnProperty(z_index)){
            this._data_layers[this.data_layer_ids_by_z_index[z_index]].prerender().render();
        }
    }

    return this;
    
    // Set zoom
    /*
    this.view.zoom = d3.behavior.zoom()
        .scaleExtent([1, 1])
        .x(this.view.xscale)
        .on("zoom", function() {
            svg.select(".datum").attr("d", line)
            console.log("zooming");
        });
    this.svg.call(this.view.zoom);
    */
    
    // Set drag
    /*
    this.drag = d3.behavior.drag()
        .on("drag", function() {
            var stage = d3.select("#"+this.id+" g.stage");
            var transform = d3.transform(stage.attr("transform"));
            transform.translate[0] += d3.event.dx;
            stage.attr("transform", transform.toString());
        }).on("dragend", function() {
            // mapTo new values
        });
    this.svg.call(this.drag);
    */    
    
};


/*****************
  Positions Panel
*/

LocusZoom.PositionsPanel = function(){
  
    LocusZoom.Panel.apply(this, arguments);   
    this.id = "positions";

    this.axes.x.render = true;
    this.axes.x.label = function(){
        return "Chromosome " + this.parent.state.chr + " (Mb)";
    }.bind(this);

    this.axes.y1.render = true;
    this.axes.y1.label = "-log10 p-value";
    
    this.xExtent = function(){
        return d3.extent(this._data_layers.positions.data, function(d) { return +d.position; } );
    };
    
    this.y1Extent = function(){
        return d3.extent(this._data_layers.positions.data, function(d) { return +d.log10pval * 1.05; } );
    };
    
    return this;
};

LocusZoom.PositionsPanel.prototype = new LocusZoom.Panel();


/*************
  Genes Panel
*/

LocusZoom.GenesPanel = function(){
    
    LocusZoom.Panel.apply(this, arguments);
    this.id = "genes";

    this.xExtent = function(){
        return d3.extent([this.parent.state.start, this.parent.state.end]);
    };
  
    return this;
};

LocusZoom.GenesPanel.prototype = new LocusZoom.Panel();

/* global LocusZoom,d3 */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

/**

  Data Layer Class

  A data layer is an abstract class representing a data set and its
  graphical representation within a panel

*/

LocusZoom.DataLayer = function() { 

    this.id     = null;
    this.parent = null;
    this.svg    = null;

    this.fields = [];
    this.data = [];
    this.metadata = {};

    // afterget is an automatic method called after data is acquired but before
    // the parent panel works with it (e.g. to generate x/y scales)
    this.postget = function(){
        return this;
    };

    // prerender is an automatic method called after data is aqcuired and after
    // the panel has access to it (e.g. to generate x/y scales), but before rendering
    this.prerender = function(){
        return this;
    };

    this.state = {
        z_index: null
    };

    this.getBaseId = function(){
        return this.parent.parent.id + "." + this.parent.id + "." + this.id;
    };
    
    return this;

};

LocusZoom.DataLayer.prototype.attachToYAxis = function(y){
    if (typeof y === "undefined"){
        y = 1;
    }
    if (y !== 1 && y !== 2){
        return false;
    } else {
        this.parent.axes["y" + y + "_data_layer_id"] = this.id;
    }
    return this;
};

// Initialize a panel
LocusZoom.DataLayer.prototype.initialize = function(){

    // Append a container group element to house the main data layer group element and the clip path
    var container = this.parent.svg.append("g")
        .attr("id", this.getBaseId() + ".data_layer_container")
        .attr("transform", "translate(" + this.parent.view.cliparea.origin.x +  "," + this.parent.view.cliparea.origin.y + ")");
        
    // Append clip path to the container element
    container.append("clipPath")
        .attr("id", this.getBaseId() + ".clip")
        .append("rect")
        .attr("width", this.parent.view.cliparea.width)
        .attr("height", this.parent.view.cliparea.height);
    
    // Append svg group for rendering all data layer elements, clipped by the clip path
    this.svg = container.append("g")
        .attr("id", this.getBaseId() + ".data_layer")
        .attr("clip-path", "url(#" + this.getBaseId() + ".clip)");

};


// Re-Map a data layer to new positions according to the parent panel's parent instance's state
LocusZoom.DataLayer.prototype.reMap = function(){
    var promise = this.parent.parent.lzd.getData(this.parent.parent.state, this.fields); //,"ld:best"
    promise.then(function(new_data){
        this.data = new_data.body;
        this.postget();
    }.bind(this));
    return promise;
};


/*********************
  Positions Data Layer
*/

LocusZoom.PositionsDataLayer = function(){

    LocusZoom.DataLayer.apply(this, arguments);  
    this.id = "positions";
    this.fields = ["id","position","pvalue","refAllele","ld:state"];

    this.postget = function(){
        this.data.map(function(d, i){
            this.data[i].ld = +d["ld:state"];
            this.data[i].log10pval = -Math.log(d.pvalue) / Math.LN10;
        }.bind(this));
        return this;
    };

    this.render = function(){
        var that = this;
        var clicker = function() {
            var me = d3.select(this);
            that.svg.selectAll("circle.lz-position").classed({"lz-selected": false});
            if (that.parent.parent.state.ldrefvar != me.attr("id")){
                me.classed({"lz-selected": true});
                that.parent.parent.state.ldrefvar = me.attr("id");
            } else {
                that.parent.parent.state.ldrefvar = null;
            }
        };
        this.svg.selectAll("*").remove(); // should this happen at all, or happen at the panel level?
        this.svg
            .selectAll("circle.lz-position")
            .data(this.data)
            .enter().append("circle")
            .attr("class", "lz-position")
            .attr("id", function(d){ return d.id; })
            .attr("cx", function(d){ return this.parent.state.x_scale(d.position); }.bind(this))
            .attr("cy", function(d){ return this.parent.state.y1_scale(d.log10pval); }.bind(this))
            .attr("fill", function(d){ return this.fillColor(d.ld); }.bind(this))
            .on("click", clicker)
            .attr("r", 4) // This should be scaled dynamically somehow
            .style({ cursor: "pointer" })
            .append("svg:title")
            .text(function(d) { return d.id; });
    };

    // TODO: abstract out to a Color Scale class and support arbitrarily many scales that can be substituted out per user input
    this.fillColor = function(pval){
        var getCutter = function(breaks) {
            var fn = function(x) {
                if (x == null || isNaN(x)){ return 0; }
                for(var i = 0; i < breaks.length; i++) {
                    if (x < breaks[i]) break;
                }
                return i;
            };
            return fn;
        };
        var cutter = getCutter([0,.2,.4,.6,.8]);
        var fill = ["#B8B8B8","#357ebd","#46b8da","#5cb85c","#eea236","#d43f3a"][ cutter(pval) ];
        return fill;
    };
       
    return this;
};

LocusZoom.PositionsDataLayer.prototype = new LocusZoom.DataLayer();


/*********************
  Recombination Rate Data Layer
*/

LocusZoom.RecombinationRateDataLayer = function(){

    LocusZoom.DataLayer.apply(this, arguments);
    this.id = "recombination_rate";
    this.fields = [];

    this.render = function(){
        this.svg.selectAll("*").remove();
    };
       
    return this;
};

LocusZoom.RecombinationRateDataLayer.prototype = new LocusZoom.DataLayer();


/*********************
  Genes Data Layer
*/

LocusZoom.GenesDataLayer = function(){

    LocusZoom.DataLayer.apply(this, arguments);
    this.id = "genes";
    this.fields = ["gene:gene"];

    this.metadata.tracks = 1;
    this.metadata.gene_track_index = { 1: [] }; // track-number-indexed object with arrays of gene indexes in the dataset
    this.metadata.min_display_range_width = 80; // minimum width in pixels for a gene, to allow enough room for its label

    // After we've loaded the genes interpret them to assign
    // each to a track so that they do not overlap in the view
    this.prerender = function(){

        // Reinitialize metadata
        this.metadata.tracks = 1;
        this.metadata.gene_track_index = { 1: [] };

        this.data.map(function(d, g){

            // Determine display range start and end, based on minimum allowable gene display width, bounded by what we can see
            // (range: values in terms of pixels on the screen)
            this.data[g].display_range = {
                start: this.parent.state.x_scale(Math.max(d.start, this.parent.parent.state.start)),
                end:   this.parent.state.x_scale(Math.min(d.end, this.parent.parent.state.end))
            };
            this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            this.data[g].display_range.text_anchor = "middle";
            if (this.data[g].display_range.width < this.metadata.min_display_range_width){
                if (d.start < this.parent.parent.state.start){
                    this.data[g].display_range.end = this.data[g].display_range.start + this.metadata.min_display_range_width;
                    this.data[g].display_range.text_anchor = "start";
                } else if (d.end > this.parent.parent.state.end){
                    this.data[g].display_range.start = this.data[g].display_range.end - this.metadata.min_display_range_width;
                    this.data[g].display_range.text_anchor = "end";
                } else {
                    var centered_margin = (this.metadata.min_display_range_width - this.data[g].display_range.width) / 2;
                    if ((this.data[g].display_range.start - centered_margin) < this.parent.state.x_scale(this.parent.parent.state.start)){
                        this.data[g].display_range.start = this.parent.state.x_scale(this.parent.parent.state.start);
                        this.data[g].display_range.end = this.data[g].display_range.start + this.metadata.min_display_range_width;
                        this.data[g].display_range.text_anchor = "start";
                    } else if ((this.data[g].display_range.end + centered_margin) > this.parent.state.x_scale(this.parent.parent.state.end)) {
                        this.data[g].display_range.end = this.parent.state.x_scale(this.parent.parent.state.end);
                        this.data[g].display_range.start = this.data[g].display_range.end - this.metadata.min_display_range_width;
                        this.data[g].display_range.text_anchor = "end";
                    } else {
                        this.data[g].display_range.start -= centered_margin;
                        this.data[g].display_range.end += centered_margin;
                    }
                }
                this.data[g].display_range.width = this.data[g].display_range.end - this.data[g].display_range.start;
            }
            // Convert and stash display range values into domain values
            // (domain: values in terms of the data set, e.g. megabases)
            this.data[g].display_domain = {
                start: this.parent.state.x_scale.invert(this.data[g].display_range.start),
                end:   this.parent.state.x_scale.invert(this.data[g].display_range.end)
            };
            this.data[g].display_domain.width = this.data[g].display_domain.end - this.data[g].display_domain.start;

            // Using display range/domain data generated above cast each gene to tracks such that none overlap
            this.data[g].track = null;
            var potential_track = 1;
            while (this.data[g].track == null){
                var collision_on_potential_track = false;
                this.metadata.gene_track_index[potential_track].map(function(placed_gene){
                    if (!collision_on_potential_track){
                        var min_start = Math.min(placed_gene.display_range.start, this.display_range.start);
                        var max_end = Math.max(placed_gene.display_range.end, this.display_range.end);
                        if ((max_end - min_start) < (placed_gene.display_range.width + this.display_range.width)){
                            collision_on_potential_track = true;
                        }
                    }
                }.bind(this.data[g]));
                if (!collision_on_potential_track){
                    this.data[g].track = potential_track;
                    this.metadata.gene_track_index[potential_track].push(this.data[g]);
                } else {
                    potential_track++;
                    if (potential_track > this.metadata.tracks){
                        this.metadata.tracks = potential_track;
                        this.metadata.gene_track_index[potential_track] = [];
                    }
                }
            }

            // Stash parent references on all genes, trascripts, and exons
            this.data[g].parent = this;
            this.data[g].transcripts.map(function(d, t){
                this.data[g].transcripts[t].parent = this.data[g];
                this.data[g].transcripts[t].exons.map(function(d, e){
                    this.data[g].transcripts[t].exons[e].parent = this.data[g].transcripts[t];
                }.bind(this));
            }.bind(this));

        }.bind(this));
        return this;
    };

    this.render = function(){
        this.svg.selectAll("*").remove();

        // Render gene groups
        this.svg.selectAll("g.lz-gene").data(this.data).enter()
            .append("g")
            .attr("class", "lz-gene")
            .attr("id", function(d){ return d.gene_name; })
            .each(function(gene){

                // Render gene boundaries
                d3.select(this).selectAll("rect.lz-gene").filter(".lz-boundary")
                    .data([gene]).enter().append("rect")
                    .attr("class", "lz-gene lz-boundary")
                    .attr("id", function(d){ return d.gene_name; })
                    .attr("x", function(d){ return this.parent.state.x_scale(d.start); }.bind(gene.parent))
                    .attr("y", function(d){ return (d.track * 40) - 20; }) // Arbitrary track height; should be dynamic
                    .attr("width", function(d){ return this.parent.state.x_scale(d.end) - this.parent.state.x_scale(d.start); }.bind(gene.parent))
                    .attr("height", 1) // This should be scaled dynamically somehow
                    .attr("fill", "#000099")
                    .style({ cursor: "pointer" })
                    .append("svg:title")
                    .text(function(d) { return d.gene_name; });

                // Render gene labels
                d3.select(this).selectAll("text.lz-gene")
                    .data([gene]).enter().append("text")
                    .attr("class", "lz-gene lz-label")
                    .attr("x", function(d){
                        if (d.display_range.text_anchor == "middle"){
                            return d.display_range.start + (d.display_range.width / 2);
                        } else if (d.display_range.text_anchor == "start"){
                            return d.display_range.start;
                        } else if (d.display_range.text_anchor == "end"){
                            return d.display_range.end;
                        }
                    })
                    .attr("y", function(d){ return (d.track * 40) - 30; })
                    .attr("text-anchor", function(d){ return d.display_range.text_anchor; })
                    .text(function(d){ return (d.strand == "+") ? d.gene_name + "→" : "←" + d.gene_name; });

                // Render exons (first transcript only, for now)
                d3.select(this).selectAll("g.lz-gene").filter(".lz-exons")
                    .data([gene]).enter().append("g")
                    .attr("class", "lz-gene lz-exons")
                    .each(function(gene){

                        d3.select(this).selectAll("rect.lz-gene").filter(".lz-exon")
                            .data(gene.transcripts[0].exons).enter().append("rect")
                            .attr("class", "lz-gene lz-exon")
                            .attr("id", function(d){ return d.exon_id; })
                            .attr("x", function(d){ return this.parent.state.x_scale(d.start); }.bind(gene.parent))
                            .attr("y", function(){ return (this.track * 40) - 26; }.bind(gene)) // Arbitrary track height
                            .attr("width", function(d){
                                return this.parent.state.x_scale(d.end) - this.parent.state.x_scale(d.start);
                            }.bind(gene.parent))
                            .attr("height", 12) // This should be scaled dynamically somehow
                            .attr("fill", "#000099")
                            .style({ cursor: "pointer" });

                    });

            });
        
    };
       
    return this;
};

LocusZoom.GenesDataLayer.prototype = new LocusZoom.DataLayer();


        if (typeof define === "function" && define.amd){
            this.LocusZoom = LocusZoom, define(LocusZoom);
        } else if (typeof module === "object" && module.exports) {
            module.exports = LocusZoom;
        } else {
            this.LocusZoom = LocusZoom;
        }

    } catch (plugin_loading_error){
        console.log("LocusZoom Plugin error: " + plugin_loading_error);
    }

}();