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

    this.initialized = false;

    this.id     = null;
    this.parent = null;
    this.svg    = {};

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

// Initialize a data layer
LocusZoom.DataLayer.prototype.initialize = function(){

    // Append a container group element to house the main data layer group element and the clip path
    this.svg.container = this.parent.svg.group.append("g")
        .attr("id", this.getBaseId() + ".data_layer_container");
        
    // Append clip path to the container element
    this.svg.clipRect = this.svg.container.append("clipPath")
        .attr("id", this.getBaseId() + ".clip")
        .append("rect");
    
    // Append svg group for rendering all data layer elements, clipped by the clip path
    this.svg.group = this.svg.container.append("g")
        .attr("id", this.getBaseId() + ".data_layer")
        .attr("clip-path", "url(#" + this.getBaseId() + ".clip)");

    // Flip the "initialized" bit
    this.initialized = true;

    return this;

};

LocusZoom.DataLayer.prototype.draw = function(){
    this.svg.container.attr("transform", "translate(" + this.parent.view.cliparea.origin.x +  "," + this.parent.view.cliparea.origin.y + ")");
    this.svg.clipRect
        .attr("width", this.parent.view.cliparea.width)
        .attr("height", this.parent.view.cliparea.height);
    return this;
}

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
            that.svg.group.selectAll("circle.lz-position").classed({"lz-selected": false});
            if (that.parent.parent.state.ldrefvar != me.attr("id")){
                me.classed({"lz-selected": true});
                that.parent.parent.state.ldrefvar = me.attr("id");
            } else {
                that.parent.parent.state.ldrefvar = null;
            }
        };
        this.svg.group.selectAll("*").remove(); // should this happen at all, or happen at the panel level?
        this.svg.group
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
        this.svg.group.selectAll("*").remove();
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
        this.svg.group.selectAll("*").remove();

        // Render gene groups
        this.svg.group.selectAll("g.lz-gene").data(this.data).enter()
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
