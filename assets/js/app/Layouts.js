/* global LocusZoom */
/* eslint-env browser */
/* eslint-disable no-console */

"use strict";

LocusZoom.Layouts = (function() {
    var obj = {};
    var layouts = {
        "plot": {},
        "panel": {},
        "data_layer": {},
        "dashboard": {}
    };

    obj.get = function(type, name, modifications) {
        if (typeof type != "string" || typeof name != "string") {
            throw("invalid arguments passed to LocusZoom.Layouts.get, requires string (layout type) and string (layout name)");
        } else if (layouts[type][name]) {
            // Get the base layout
            var layout = LocusZoom.Layouts.merge(modifications || {}, layouts[type][name]);
            // Determine the default namespace for namespaced values
            var default_namespace = "";
            if (typeof layout.namespace == "string"){
                default_namespace = layout.namespace;
            } else if (typeof layout.namespace == "object" && Object.keys(layout.namespace).length){
                if (typeof layout.namespace.default != "undefined"){
                    default_namespace = layout.namespace.default;
                } else {
                    default_namespace = layout.namespace[Object.keys(layout.namespace)[0]].toString();
                }
            }
            default_namespace += default_namespace.length ? ":" : "";
            // Apply namespaces to layout, recursively
            var applyNamespaces = function(element){
                if (typeof element == "string"){
                    var re = /\{\{namespace(\[[A-Za-z_0-9]+\]|)\}\}/g;
                    var match, base, key, namespace;
                    var replace = [];
                    while ((match = re.exec(element)) !== null){
                        base = match[0];
                        key  = match[1].length ? match[1].replace(/(\[|\])/g,"") : null;
                        namespace = default_namespace;
                        if (typeof layout.namespace == "object" && typeof layout.namespace[key] != "undefined"){
                            namespace = layout.namespace[key] + (layout.namespace[key].length ? ":" : "");
                        }
                        replace.push({ base: base, namespace: namespace });
                    }
                    for (var r in replace){
                        element = element.replace(replace[r].base, replace[r].namespace);
                    }
                } else if (typeof element == "object" && element != null){
                    for (var property in element) {
                        var namespaced_element = applyNamespaces(element[property]);
                        var namespaced_property = applyNamespaces(property);
                        if (property != namespaced_property){
                            delete element[property];
                        }
                        element[namespaced_property] = namespaced_element;
                    }
                }
                return element;
            };
            layout = applyNamespaces(layout);
            // Return the layout as valid JSON only
            return JSON.parse(JSON.stringify(layout));
        } else {
            throw("layout type [" + type + "] name [" + name + "] not found");
        }
    };

    obj.set = function(type, name, layout) {
        if (typeof type != "string" || typeof name != "string" || typeof layout != "object"){
            throw ("unable to set new layout; bad arguments passed to set()");
        }
        if (!layouts[type]){
            layouts[type] = {};
        }
        if (layout){
            layouts[type][name] = JSON.parse(JSON.stringify(layout));
        } else {
            delete layouts[type][name];
        }
    };

    obj.add = function(type, name, layout) {
        obj.set(type, name, layout);
    };

    obj.list = function(type) {
        if (!layouts[type]){
            var list = {};
            Object.keys(layouts).forEach(function(type){
                list[type] =  Object.keys(layouts[type]);
            });
            return list;
        } else {
            return Object.keys(layouts[type]);
        }
    };

    // Merge any two layout objects
    // Primarily used to merge values from the second argument (the "default" layout) into the first (the "custom" layout)
    // Ensures that all values defined in the second layout are at least present in the first
    // Favors values defined in the first layout if values are defined in both but different
    obj.merge = function (custom_layout, default_layout) {
        if (typeof custom_layout != "object" || typeof default_layout != "object"){
            throw("LocusZoom.Layouts.merge only accepts two layout objects; " + (typeof custom_layout) + ", " + (typeof default_layout) + " given");
        }
        for (var property in default_layout) {
            if (!default_layout.hasOwnProperty(property)){ continue; }
            // Get types for comparison. Treat nulls in the custom layout as undefined for simplicity.
            // (javascript treats nulls as "object" when we just want to overwrite them as if they're undefined)
            // Also separate arrays from objects as a discrete type.
            var custom_type  = custom_layout[property] == null ? "undefined" : typeof custom_layout[property];
            var default_type = typeof default_layout[property];
            if (custom_type == "object" && Array.isArray(custom_layout[property])){ custom_type = "array"; }
            if (default_type == "object" && Array.isArray(default_layout[property])){ default_type = "array"; }
            // Unsupported property types: throw an exception
            if (custom_type == "function" || default_type == "function"){
                throw("LocusZoom.Layouts.merge encountered an unsupported property type");
            }
            // Undefined custom value: pull the default value
            if (custom_type == "undefined"){
                custom_layout[property] = JSON.parse(JSON.stringify(default_layout[property]));
                continue;
            }
            // Both values are objects: merge recursively
            if (custom_type == "object" && default_type == "object"){
                custom_layout[property] = LocusZoom.Layouts.merge(custom_layout[property], default_layout[property]);
                continue;
            }
        }
        return custom_layout;
    };

    return obj;
})();


/**
 Data Layer Layouts
*/

LocusZoom.Layouts.add("data_layer", "signifigance", {
    namespace: "sig",
    id: "significance",
    type: "line",
    fields: ["{{namespace}}x", "{{namespace}}y"],
    z_index: 0,
    style: {
        "stroke": "#D3D3D3",
        "stroke-width": "3px",
        "stroke-dasharray": "10px 10px"
    },
    x_axis: {
        field: "{{namespace}}x",
        decoupled: true
    },
    y_axis: {
        axis: 1,
        field: "{{namespace}}y"
    }
});

LocusZoom.Layouts.add("data_layer", "recomb_rate", {
    namespace: "recomb",
    id: "recombrate",
    type: "line",
    fields: ["{{namespace}}position", "{{namespace}}recomb_rate"],
    z_index: 1,
    style: {
        "stroke": "#0000FF",
        "stroke-width": "1.5px"
    },
    x_axis: {
        field: "{{namespace}}position"
    },
    y_axis: {
        axis: 2,
        field: "{{namespace}}recomb_rate",
        floor: 0,
        ceiling: 100
    },
    transition: {
        duration: 200
    }
});

LocusZoom.Layouts.add("data_layer", "association_pvalues", {
    namespace: { "default": "", "ld": "ld" },
    id: "associationpvalues",
    type: "scatter",
    point_shape: {
        scale_function: "if",
        field: "{{namespace[ld]}}isrefvar",
        parameters: {
            field_value: 1,
            then: "diamond",
            else: "circle"
        }
    },
    point_size: {
        scale_function: "if",
        field: "{{namespace[ld]}}isrefvar",
        parameters: {
            field_value: 1,
            then: 80,
            else: 40
        }
    },
    color: [
        {
            scale_function: "if",
            field: "{{namespace[ld]}}isrefvar",
            parameters: {
                field_value: 1,
                then: "#9632b8"
            }
        },
        {
            scale_function: "numerical_bin",
            field: "{{namespace[ld]}}state",
            parameters: {
                breaks: [0, 0.2, 0.4, 0.6, 0.8],
                values: ["#357ebd","#46b8da","#5cb85c","#eea236","#d43f3a"]
            }
        },
        "#B8B8B8"
    ],
    legend: [
        { shape: "diamond", color: "#9632b8", size: 40, label: "LD Ref Var", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#d43f3a", size: 40, label: "1.0 > r² ≥ 0.8", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#eea236", size: 40, label: "0.8 > r² ≥ 0.6", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#5cb85c", size: 40, label: "0.6 > r² ≥ 0.4", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#46b8da", size: 40, label: "0.4 > r² ≥ 0.2", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#357ebd", size: 40, label: "0.2 > r² ≥ 0.0", class: "lz-data_layer-scatter" },
        { shape: "circle", color: "#B8B8B8", size: 40, label: "no r² data", class: "lz-data_layer-scatter" }
    ],
    fields: ["{{namespace}}variant", "{{namespace}}position", "{{namespace}}pvalue|scinotation", "{{namespace}}pvalue|neglog10", "{{namespace}}log_pvalue", "{{namespace}}ref_allele", "{{namespace[ld]}}state", "{{namespace[ld]}}isrefvar"],
    id_field: "{{namespace}}variant",
    z_index: 2,
    x_axis: {
        field: "{{namespace}}position"
    },
    y_axis: {
        axis: 1,
        field: "{{namespace}}log_pvalue",
        floor: 0,
        upper_buffer: 0.10,
        min_extent: [ 0, 10 ]
    },
    transition: {
        duration: 200
    },
    highlighted: {
        onmouseover: "on",
        onmouseout: "off"
    },
    selected: {
        onclick: "toggle_exclusive",
        onshiftclick: "toggle"
    },
    tooltip: {
        closable: true,
        show: { or: ["highlighted", "selected"] },
        hide: { and: ["unhighlighted", "unselected"] },
        html: "<strong>{{{{namespace}}variant}}</strong><br>"
            + "P Value: <strong>{{{{namespace}}pvalue|scinotation}}</strong><br>"
            + "Ref. Allele: <strong>{{{{namespace}}ref_allele}}</strong><br>"
    }
});

LocusZoom.Layouts.add("data_layer", "phewas_pvalues", {
    id: "phewaspvalues",
    type: "scatter",
    point_shape: "circle",
    point_size: 70,
    id_field: "{{namespace}}id",
    transition: {
        duration: 500
    },
    fields: ["{{namespace}}id", "{{namespace}}x", "{{namespace}}category_name", "{{namespace}}num_cases", "{{namespace}}num_controls", "{{namespace}}phewas_string", "{{namespace}}phewas_code", "{{namespace}}pval|scinotation", "{{namespace}}pval|neglog10"],
    x_axis: {
        field: "{{namespace}}x"
    },
    y_axis: {
        axis: 1,
        field: "{{namespace}}pval|neglog10",
        floor: 0,
        upper_buffer: 0.1
    },
    color: {
        field: "{{namespace}}category_name",
        scale_function: "categorical_bin",
        parameters: {
            categories: ["infectious diseases", "neoplasms", "endocrine/metabolic", "hematopoietic", "mental disorders", "neurological", "sense organs", "circulatory system", "respiratory", "digestive", "genitourinary", "pregnancy complications", "dermatologic", "musculoskeletal", "congenital anomalies", "symptoms", "injuries & poisonings"],
            values: ["rgba(57,59,121,0.7)", "rgba(82,84,163,0.7)", "rgba(107,110,207,0.7)", "rgba(156,158,222,0.7)", "rgba(99,121,57,0.7)", "rgba(140,162,82,0.7)", "rgba(181,207,107,0.7)", "rgba(140,109,49,0.7)", "rgba(189,158,57,0.7)", "rgba(231,186,82,0.7)", "rgba(132,60,57,0.7)", "rgba(173,73,74,0.7)", "rgba(214,97,107,0.7)", "rgba(231,150,156,0.7)", "rgba(123,65,115,0.7)", "rgba(165,81,148,0.7)", "rgba(206,109,189,0.7)", "rgba(222,158,214,0.7)"],
            null_value: "#B8B8B8"
        }
    },
    tooltip: {
        closable: true,
        show: { or: ["highlighted", "selected"] },
        hide: { and: ["unhighlighted", "unselected"] },
        html: "<div><strong>{{{{namespace}}phewas_string}}</strong></div><div>P Value: <strong>{{{{namespace}}pval|scinotation}}</strong></div>"
    },
    highlighted: {
        onmouseover: "on",
        onmouseout: "off"
    },
    selected: {
        onclick: "toggle_exclusive",
        onshiftclick: "toggle"
    },
    label: {
        text: "{{{{namespace}}phewas_string}}",
        spacing: 6,
        lines: {
            style: {
                "stroke-width": "2px",
                "stroke": "#333333",
                "stroke-dasharray": "2px 2px"
            }
        },
        filters: [
            {
                field: "{{namespace}}pval|neglog10",
                operator: ">=",
                value: 5
            }
        ],
        style: {
            "font-size": "14px",
            "font-weight": "bold",
            "fill": "#333333"
        }
    }
});

LocusZoom.Layouts.add("data_layer", "genes", {
    namespace: { "gene": "gene", "constraint": "constraint" },
    id: "genes",
    type: "genes",
    fields: ["{{namespace[gene]}}gene", "{{namespace[constraint]}}constraint"],
    id_field: "gene_id",
    highlighted: {
        onmouseover: "on",
        onmouseout: "off"
    },
    selected: {
        onclick: "toggle_exclusive",
        onshiftclick: "toggle"
    },
    transition: {
        duration: 200
    },
    tooltip: {
        closable: true,
        show: { or: ["highlighted", "selected"] },
        hide: { and: ["unhighlighted", "unselected"] },
        html: "<h4><strong><i>{{gene_name}}</i></strong></h4>"
            + "<div style=\"float: left;\">Gene ID: <strong>{{gene_id}}</strong></div>"
            + "<div style=\"float: right;\">Transcript ID: <strong>{{transcript_id}}</strong></div>"
            + "<div style=\"clear: both;\"></div>"
            + "<table>"
            + "<tr><th>Constraint</th><th>Expected variants</th><th>Observed variants</th><th>Const. Metric</th></tr>"
            + "<tr><td>Synonymous</td><td>{{exp_syn}}</td><td>{{n_syn}}</td><td>z = {{syn_z}}</td></tr>"
            + "<tr><td>Missense</td><td>{{exp_mis}}</td><td>{{n_mis}}</td><td>z = {{mis_z}}</td></tr>"
            + "<tr><td>LoF</td><td>{{exp_lof}}</td><td>{{n_lof}}</td><td>pLI = {{pLI}}</td></tr>"
            + "</table>"
            + "<table width=\"100%\"><tr>"
            + "<td><button onclick=\"LocusZoom.getToolTipPlot(this).panel_ids_by_y_index.forEach(function(panel){ if(panel == 'genes'){ return; } var filters = (panel.indexOf('intervals') != -1 ? [['intervals:start','>=','{{start}}'],['intervals:end','<=','{{end}}']] : [['position','>','{{start}}'],['position','<','{{end}}']]); LocusZoom.getToolTipPlot(this).panels[panel].undimElementsByFilters(filters, true); }.bind(this)); LocusZoom.getToolTipPanel(this).data_layers.genes.unselectAllElements();\">Identify data in region</button></td>"
            + "<td style=\"text-align: right;\"><a href=\"http://exac.broadinstitute.org/gene/{{gene_id}}\" target=\"_new\">More data on ExAC</a></td>"
            + "</tr></table>"
    }
});

LocusZoom.Layouts.add("data_layer", "genome_legend", {
    namespace: "genome",
    id: "genome_legend",
    type: "genome_legend",
    fields: ["{{namespace}}chr", "{{namespace}}base_pairs"],
    x_axis: {
        floor: 0,
        ceiling: 2881033286
    }
});

LocusZoom.Layouts.add("data_layer", "intervals", {
    namespace: "intervals",
    id: "intervals",
    type: "intervals",
    fields: ["{{namespace}}start","{{namespace}}end","{{namespace}}state_id","{{namespace}}state_name"],
    id_field: "{{namespace}}start",
    start_field: "{{namespace}}start",
    end_field: "{{namespace}}end",
    track_split_field: "{{namespace}}state_id",
    split_tracks: false,
    color: {
        field: "{{namespace}}state_id",
        scale_function: "categorical_bin",
        parameters: {
            categories: [1,2,3,4,5,6,7,8,9,10,12,13],
            values: ["rgb(212,63,58)", "rgb(250,120,105)", "rgb(252,168,139)", "rgb(240,189,66)", "rgb(250,224,105)", "rgb(240,238,84)", "rgb(244,252,23)", "rgb(23,232,252)", "rgb(32,191,17)", "rgb(23,166,77)", "rgb(162,133,166)", "rgb(212,212,212)"],
            null_value: "#B8B8B8"
        }
    },
    legend: [
        { shape: "rect", color: "rgb(212,63,58)", width: 9, label: "Active Promoter", "{{namespace}}state_id": 1 },
        { shape: "rect", color: "rgb(250,120,105)", width: 9, label: "Weak Promoter", "{{namespace}}state_id": 2 },
        { shape: "rect", color: "rgb(252,168,139)", width: 9, label: "Poised Promoter", "{{namespace}}state_id": 3 },
        { shape: "rect", color: "rgb(240,189,66)", width: 9, label: "Strong enhancer", "{{namespace}}state_id": 4 },
        { shape: "rect", color: "rgb(250,224,105)", width: 9, label: "Strong enhancer", "{{namespace}}state_id": 5 },
        { shape: "rect", color: "rgb(240,238,84)", width: 9, label: "Weak enhancer", "{{namespace}}state_id": 6 },
        { shape: "rect", color: "rgb(244,252,23)", width: 9, label: "Weak enhancer", "{{namespace}}state_id": 7 },
        { shape: "rect", color: "rgb(23,232,252)", width: 9, label: "Insulator", "{{namespace}}state_id": 8 },
        { shape: "rect", color: "rgb(32,191,17)", width: 9, label: "Transcriptional transition", "{{namespace}}state_id": 9 },
        { shape: "rect", color: "rgb(23,166,77)", width: 9, label: "Transcriptional elongation", "{{namespace}}state_id": 10 },
        { shape: "rect", color: "rgb(162,133,166)", width: 9, label: "Polycomb-repressed", "{{namespace}}state_id": 12 },
        { shape: "rect", color: "rgb(212,212,212)", width: 9, label: "Heterochromatin / low signal", "{{namespace}}state_id": 13 }
    ],    
    highlighted: {
        onmouseover: "on",
        onmouseout: "off"
    },
    selected: {
        onclick: "toggle_exclusive",
        onshiftclick: "toggle"
    },
    transition: {
        duration: 200
    },
    tooltip: {
        closable: false,
        show: { or: ["highlighted", "selected"] },
        hide: { and: ["unhighlighted", "unselected"] },
        html: "{{{{namespace}}state_name}}<br>{{{{namespace}}start}}-{{{{namespace}}end}}"
    }
});


/**
 Dashboard Layouts
*/

LocusZoom.Layouts.add("dashboard", "standard_panel", {
    components: [
        {
            type: "remove_panel",
            position: "right",
            color: "red"
        },
        {
            type: "move_panel_up",
            position: "right"
        },
        {
            type: "move_panel_down",
            position: "right"
        }
    ]
});                 

LocusZoom.Layouts.add("dashboard", "standard_plot", {
    components: [
        {
            type: "title",
            title: "LocusZoom",
            subtitle: "<a href=\"https://statgen.github.io/locuszoom/\" target=\"_blank\">v" + LocusZoom.version + "</a>",
            position: "left"
        },
        {
            type: "dimensions",
            position: "right"
        },
        {
            type: "region_scale",
            position: "right"
        },
        {
            type: "download",
            position: "right"
        }
    ]
});

/**
 Panel Layouts
*/

LocusZoom.Layouts.add("panel", "association", {
    id: "association",
    title: "",
    width: 800,
    height: 225,
    min_width:  400,
    min_height: 200,
    proportional_width: 1,
    margin: { top: 35, right: 50, bottom: 40, left: 50 },
    inner_border: "rgba(210, 210, 210, 0.85)",
    dashboard: (function(){
        var l = LocusZoom.Layouts.get("dashboard", "standard_panel");
        l.components.push({
            type: "toggle_legend",
            position: "right",
            color: "green"
        });
        return l;
    })(),
    axes: {
        x: {
            label_function: "chromosome",
            label_offset: 32,
            tick_format: "region",
            extent: "state"
        },
        y1: {
            label: "-log10 p-value",
            label_offset: 28
        },
        y2: {
            label: "Recombination Rate (cM/Mb)",
            label_offset: 40
        }
    },
    legend: {
        orientation: "vertical",
        origin: { x: 55, y: 40 },
        hidden: true
    },
    interaction: {
        drag_background_to_pan: true,
        drag_x_ticks_to_scale: true,
        drag_y1_ticks_to_scale: true,
        drag_y2_ticks_to_scale: true,
        scroll_to_zoom: true,
        x_linked: true
    },
    data_layers: [
        LocusZoom.Layouts.get("data_layer", "signifigance"),
        LocusZoom.Layouts.get("data_layer", "recomb_rate"),
        LocusZoom.Layouts.get("data_layer", "association_pvalues")
    ]
});

LocusZoom.Layouts.add("panel", "genes", {
    id: "genes",
    width: 800,
    height: 225,
    min_width: 400,
    min_height: 112.5,
    proportional_width: 1,
    margin: { top: 20, right: 50, bottom: 20, left: 50 },
    axes: {},
    interaction: {
        drag_background_to_pan: true,
        scroll_to_zoom: true,
        x_linked: true
    },
    dashboard: (function(){
        var l = LocusZoom.Layouts.get("dashboard", "standard_panel");
        l.components.push({
            type: "resize_to_data",
            position: "right",
            color: "blue"
        });
        return l;
    })(),   
    data_layers: [
        LocusZoom.Layouts.get("data_layer", "genes")
    ]
});

LocusZoom.Layouts.add("panel", "phewas", {
    id: "phewas",
    width: 800,
    height: 300,
    min_width:  800,
    min_height: 300,
    proportional_width: 1,
    margin: { top: 20, right: 50, bottom: 120, left: 50 },
    inner_border: "rgba(210, 210, 210, 0.85)",
    axes: {
        x: {
            ticks: [
                {
                    x: 0,
                    text: "Infectious Disease",
                    style: {
                        "fill": "#393b79",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 44,
                    text: "Neoplasms",
                    style: {
                        "fill": "#5254a3",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 174,
                    text: "Endocrine/Metabolic",
                    style: {
                        "fill": "#6b6ecf",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 288,
                    text: "Hematopoietic",
                    style: {
                        "fill": "#9c9ede",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 325,
                    text: "Mental Disorders",
                    style: {
                        "fill": "#637939",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 384,
                    text: "Neurological",
                    style: {
                        "fill": "#8ca252",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 451,
                    text: "Sense Organs",
                    style: {
                        "fill": "#b5cf6b",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 558,
                    text: "Circulatory System",
                    style: {
                        "fill": "#8c6d31",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 705,
                    text: "Respiratory",
                    style: {
                        "fill": "#bd9e39",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 778,
                    text: "Digestive",
                    style: {
                        "fill": "#e7ba52",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 922,
                    text: "Genitourinary",
                    style: {
                        "fill": "#843c39",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1073,
                    text: "Pregnancy Complications",
                    style: {
                        "fill": "#ad494a",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1097,
                    text: "Dermatologic",
                    style: {
                        "fill": "#d6616b",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1170,
                    text: "Musculoskeletal",
                    style: {
                        "fill": "#e7969c",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1282,
                    text: "Congenital Anomalies",
                    style: {
                        "fill": "#7b4173",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1323,
                    text: "Symptoms",
                    style: {
                        "fill": "#a55194",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                },
                {
                    x: 1361,
                    text: "Injuries & Poisonings",
                    style: {
                        "fill": "#ce6dbd",
                        "font-weight": "bold",
                        "font-size": "11px",
                        "text-anchor": "start"
                    },
                    transform: "translate(15, 0) rotate(50)"
                }
            ]
        },
        y1: {
            label: "-log10 p-value",
            label_offset: 28
        }
    },
    data_layers: [
        LocusZoom.Layouts.get("data_layer", "signifigance"),
        LocusZoom.Layouts.get("data_layer", "phewas_pvalues")
    ]
});

LocusZoom.Layouts.add("panel", "genome_legend", {
    id: "genome_legend",
    width: 800,
    height: 50,
    origin: { x: 0, y: 300 },
    min_width:  800,
    min_height: 50,
    proportional_width: 1,
    margin: { top: 0, right: 50, bottom: 35, left: 50 },
    axes: {
        x: {
            label: "Genomic Position (number denotes chromosome)",
            label_offset: 35,
            ticks: [
                {
                    x: 124625310,
                    text: "1",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 370850307,
                    text: "2",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 591461209,
                    text: "3",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 786049562,
                    text: "4",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 972084330,
                    text: "5",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1148099493,
                    text: "6",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1313226358,
                    text: "7",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1465977701,
                    text: "8",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1609766427,
                    text: "9",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1748140516,
                    text: "10",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 1883411148,
                    text: "11",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2017840353,
                    text: "12",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2142351240,
                    text: "13",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2253610949,
                    text: "14",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2358551415,
                    text: "15",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2454994487,
                    text: "16",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2540769469,
                    text: "17",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2620405698,
                    text: "18",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2689008813,
                    text: "19",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2750086065,
                    text: "20",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2805663772,
                    text: "21",
                    style: {
                        "fill": "rgb(120, 120, 186)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                },
                {
                    x: 2855381003,
                    text: "22",
                    style: {
                        "fill": "rgb(0, 0, 66)",
                        "text-anchor": "center",
                        "font-size": "14px",
                        "font-weight": "bold"
                    },
                    transform: "translate(0, 2)"
                }
            ]
        }
    },
    data_layers: [
        LocusZoom.Layouts.get("data_layer", "genome_legend")
    ]
});

LocusZoom.Layouts.add("panel", "intervals", {
    id: "intervals",
    width: 1000,
    height: 120,
    min_width: 500,
    min_height: 120,
    margin: { top: 25, right: 150, bottom: 75, left: 50 },
    dashboard: (function(){
        var l = LocusZoom.Layouts.get("dashboard", "standard_panel");
        l.components.push({
            type: "toggle_split_tracks",
            data_layer_id: "intervals",
            position: "right",
            color: "yellow"
        });
        return l;
    })(),
    axes: {},
    interaction: {
        drag_background_to_pan: true,
        scroll_to_zoom: true,
        x_linked: true
    },
    legend: {
        orientation: "horizontal",
        origin: { x: 50, y: 0 },
        pad_from_bottom: 5
    },
    data_layers: [
        LocusZoom.Layouts.get("data_layer", "intervals")
    ]
});


/**
 Plot Layouts
*/

LocusZoom.Layouts.add("plot", "standard_association", {
    state: {},
    width: 800,
    height: 450,
    resizable: "responsive",
    min_region_scale: 20000,
    max_region_scale: 4000000,
    dashboard: LocusZoom.Layouts.get("dashboard", "standard_plot"),
    panels: [
        LocusZoom.Layouts.get("panel", "association", { proportional_height: 0.5 }),
        LocusZoom.Layouts.get("panel", "genes", { proportional_height: 0.5 })
    ]
});

// Shortcut to "StandardLayout" for backward compatibility
LocusZoom.StandardLayout = LocusZoom.Layouts.get("plot", "standard_association");

LocusZoom.Layouts.add("plot", "standard_phewas", {
    width: 800,
    height: 600,
    min_width: 800,
    min_height: 600,
    responsive_resize: true,
    dashboard: LocusZoom.Layouts.get("dashboard", "standard_plot"),
    panels: [
        LocusZoom.Layouts.get("panel", "phewas", { proportional_height: 0.45 }),
        LocusZoom.Layouts.get("panel", "genome_legend", { proportional_height: 0.1 }),
        LocusZoom.Layouts.get("panel", "genes", { proportional_height: 0.45 })
    ]
});

LocusZoom.Layouts.add("plot", "interval_association", {
    state: {},
    width: 800,
    height: 550,
    resizable: "responsive",
    min_region_scale: 20000,
    max_region_scale: 4000000,
    dashboard: LocusZoom.Layouts.get("dashboard", "standard_plot"),
    panels: [
        LocusZoom.Layouts.get("panel", "association", { width: 800, proportional_height: (225/570) }),
        LocusZoom.Layouts.get("panel", "intervals", { proportional_height: (120/570) }),
        LocusZoom.Layouts.get("panel", "genes", { width: 800, proportional_height: (225/570) })
    ]
});