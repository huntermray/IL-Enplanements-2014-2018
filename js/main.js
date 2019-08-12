//First line of main.js...wrap everything in a self-executing anonymous function to move to local scope
(function(){

//pseudo-global variables

//variables for data join
var attrArray = ["CY2018","CY2017","CY2016","CY2015","CY2014","Avg5Yr","Default"]; //list of attributes

var expressed = attrArray[6]; //initial attribute

//chart frame dimensions
var chartWidth = window.innerWidth*0.425,
    chartHeight = 460,
    leftPadding = 25,
    rightPadding = 20,
    topBottomPadding = 5,
    chartInnerWidth = chartWidth - leftPadding - rightPadding,
    chartInnerHeight = chartHeight - topBottomPadding * 2,
    translate = "translate(" + leftPadding + "," + topBottomPadding + ")";
    
// width, height, margins and padding
var margin = {top: 20, right: 30, bottom: 40, left: 30},
    width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// scales
var xScale = d3.scaleLinear()
    .range([0, width]);

var yScale = d3.scaleBand()
    .rangeRound([0, height])
    .paddingInner(0.1);

var div = d3.select("#container").append("div")
.attr("class", "tooltip")
.style("opacity", 0);
    
var divRegions = d3.select("#mapContainer").append("div")
.attr("class", "tooltip")
.style("opacity", 0);

//begin script when window loads
window.onload = setMap();setGraph();

    //setMap begins map setup functions
    function setMap(){

        //create new svg container for the map
        var map = d3.select("#mapContainer")
            .append("svg")
            .attr("class", "map")
            .attr("width", "auto")
            .attr("height", "auto");

        //create Albers equal area conic projection centered on Illinois
        var projection = d3.geoAlbers()
            .center([14.5, 38.8])
            .rotate([99, 0, -6])
            .parallels([29, 45])
            .scale(3500)
            .translate([width / 2, height / 2]);

        var path = d3.geoPath()
            .projection(projection);

        //use d3.queue to parallelize asynchronous data loading
        d3.queue()
            .defer(d3.csv, "data/ILEnpYrChng2.csv") //load attributes from csv
            .defer(d3.json, "data/IL_StateBoundary.topojson") //load background spatial data
            .defer(d3.json, "data/USstatessimple.topojson") //load background spatial data
            .defer(d3.json, "data/ILAirportPolygons.topojson") //load chloropleth spatial data
            .await(callback);

        function callback(error, csvData, illinois, states, enplanements){
            console.log("Errors:",error);
            //console.log("CSV data:",csvData);
            //console.log("il topojson:",illinois);
            //console.log("enplanements topojson:",enplanements);
            
            
            //create the color scale
            var colorScale = makeColorScale(csvData);

            //translate ILAirportPolys TopoJSON
            var ilBoundary = topojson.feature(illinois, illinois.objects.IL_StateBoundary2);
            
            var states = topojson.feature(states, states.objects.USstates);

            //translate Enplanements TopoJSON
            var enplanementsPolys = topojson.feature(enplanements, enplanements.objects.Polygons).features;

            //examine the results
            //console.log("ilBoundary:",ilBoundary);
            //console.log("enplanements features:",enplanementsPolys);

            //add IL Boundary to map
            var state = map.append("path")
                .datum(ilBoundary)
                .attr("class", "illinois")
                .attr("d", path);
            
            //add IL Boundary to map
            var usStates = map.append("path")
                .datum(states)
                .attr("class", "states")
                .attr("d", path);
            
            enplanementsPolys = joinData(enplanementsPolys,csvData);
            
            //add enumeration units to the map
            setEnumerationUnits(enplanementsPolys, map, path, colorScale);
            
            //add coordianted visualization to the map
            createDropdown(csvData);
            
        }; //end of callback() function
    }; //end of setMap() function
    
    function joinData(enplanementsPolys,csvData){
        //loop through csv to assign each set of csv attribute values to geojson airport
        for (var i=0; i<csvData.length; i++){
            var csvCode = csvData[i]; //the current region
            var csvKey = csvCode.IATA; //the CSV primary key

            //loop through geojson airport to find correct region
            for (var a=0; a<enplanementsPolys.length; a++){

                var geojsonProps = enplanementsPolys[a].properties; //the current airport geojson properties
                var geojsonKey = geojsonProps.IATA; //the geojson primary key

                //where primary keys match, transfer csv data to geojson properties object
                if (geojsonKey == csvKey){

                    //assign all attributes and values
                    attrArray.forEach(function(attr){
                        var val = parseFloat(csvCode[attr]); //get csv attribute value
                        geojsonProps[attr] = val; //assign attribute and value to geojson properties
                    });
                };
            };
        };
        return enplanementsPolys;
    }; //end of joinData() function
    
    function makeColorScale(data){
        var colorClasses = [
            "#de2d26",
            "#c2e699",
            "#78c679",
            "#31a354",
            "#006837"
        ];

        //create color scale generator
        var colorScale = d3.scaleQuantile()
            .range(colorClasses);

        //build two-value array of minimum and maximum expressed attribute values
        var minmax = [
            d3.min(data, function(d) { return parseFloat(d[expressed]); }),
            d3.max(data, function(d) { return parseFloat(d[expressed]); })
        ];
        
        //assign two-value array as scale domain
        colorScale.domain(minmax);

        return colorScale;
    }; //end of makeColorScale() function
    
    function setEnumerationUnits(enplanementsPolys,map,path,colorScale){
            //add IL Airport Theissen Polygons to map
            var airports = map.selectAll(".regions")
                .data(enplanementsPolys)
                .enter()
                .append("path")
                .attr("class", function(d){
                    return "regions " + d.properties.IATA;
                })
                .attr("d", path)
                .style("fill",function(d){
                    return choropleth(d.properties, colorScale);
                })
                .on("mouseover", function(d){
                    highlight(d.properties);
                })
                .on("mouseout", function(d){
                    dehighlight(d.properties);
                })
                .on("mousemove", moveLabel);
        
            var desc = airports.append("desc")
                .text('{"stroke": "#000", "stroke-width": "0.5px"}');
        
    }; //end of setEnumeration() function
    
    //function to test for data value and return color
    function choropleth(props, colorScale){
        //make sure attribute value is a number
        var val = parseFloat(props[expressed]);
        //if attribute value exists, assign a color; otherwise assign gray
        if (val=='0'){
            return "#eaeaea";
        } if (typeof val == 'number' && !isNaN(val)){
            return colorScale(val);
        } else {
            return "#CCC";
        };
    }; //end of choropleth() function
    
    //function to create coordinated bar chart
    function setGraph(highlight,dehighlight){
            // load data
            d3.csv("data/ILEnpYrChng2.csv", type, function(error, data) {	

                console.log(data);

                // domains
                xScale.domain(d3.extent(data, function(d) { return d.Bounds; })).nice();
                yScale.domain(data.map(function(d) { return d.IATA; }));

                // define X axis
                var formatAsPercentage = d3.format("1.0%");

                var xAxis = d3.axisBottom()
                                      .scale(xScale)
                                      .tickFormat(formatAsPercentage);

                // create svg
                var svg = d3.select("#graph")
                    .append("svg")
                        .attr("width", (width+50))
                        .attr("height", "500")
                    .append("g")
                        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                // format tooltip
                var thsndFormat = d3.format(",");

                // create  bars
                var bars = svg.selectAll(".bar")
                    .data(data)
                    .enter()
                    .append("rect")
                    .attr("class", function(d) { return "bar "+(d.IATA)+" bar--" + (d.Default < 0 ? "negative" : "positive"); })
                    .attr("x", function(d) { return xScale(Math.min(0, d.Default)); })
                    .attr("y", function(d) { return yScale(d.IATA); })
                    .attr("width", function(d) { return Math.abs(xScale(d.Default) - xScale(0)); })
                    .attr("height", yScale.bandwidth())
                    .on("mouseover", highlight)
                    .on("mouseout", dehighlight)
                    .on("mousemove", moveLabel);

                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis);
                
                var chartTitle = d3.select("#graphTitle")
                    .append("text")
                    .attr("x", 40)
                    .attr("y", 40)
                    .attr("class", "graphTitle")
                    .text("Change (%) in Enplanements During CY2018 per Airport");
                
                var desc = bars.append("desc")
                    .text('{"stroke": "#000", "stroke-width": "0.5px"}');

                // add tickNegative
                var tickNeg = svg.append("g")
                        .attr("class", "y axis")
                        .attr("transform", "translate(" + xScale(0) + ",0)")
                        .call(d3.axisLeft(yScale))
                    .selectAll(".tick")
                    .filter(function(d, i) { return data[i].Default < 0; });

                tickNeg.select("line")
                    .attr("x2", 6);

                tickNeg.select("text")
                    .attr("x", 9)
                    .style("text-anchor", "start");
                });

        function type(d) {
            d.CY2018 = +d.CY2018;
            d.CY2017 = +d.CY2017;
            d.CY2016 = +d.CY2016;
            d.CY2015 = +d.CY2015;
            d.CY2014 = +d.CY2014;
            d.Avg5Yr = +d.Avg5Yr;
            d.Bounds = +d.Bounds;
            d.Default = +d.Default;
          return d;
        }
        //updateChart(bars,csvData.lenth,colorScale);

    }; //end of setGraph() function
    
    //function to create a dropdown menu for attribute selection
    function createDropdown(csvData){
        //add select element
        var dropdown = d3.select("#ddContainer")
            .append("select")
            .attr("class", "dropdown")
            .on("change",function(){
                changeAttribute(this.value, csvData)
            });

        //add initial option
        var titleOption = dropdown.append("option")
            .attr("class", "titleOption")
            .attr("disabled", "true")
            .text("Select Attribute");

        //add attribute name options
        var attrOptions = dropdown.selectAll("attrOptions")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", function(d){ return d })
            .text(function(d){ return d });
    }; //end of createDropdown() function
    
    //dropdown change listener handler
    function changeAttribute(attribute, csvData){
        //change the expressed attribute
        expressed = attribute;

        //recreate the color scale
        var colorScale = makeColorScale(csvData);

        //recolor enumeration units
        var regions = d3.selectAll(".regions")
            .style("fill", function(d){
                return choropleth(d.properties, colorScale)
            });

        //re-sort, resize, and recolor bars
        var bars = d3.selectAll(".bar")
                        .attr("class", function(d) { return "bar "+(d.IATA)+" bar--" + (d.Avg5Yr < 0 ? "negative" : "positive"); })
                        .attr("x", function(d) { return xScale(Math.min(0,d[expressed])); })
                        .attr("y", function(d) { return yScale(d.IATA); })
                        .attr("width", function(d) { return Math.abs(xScale(d[expressed]) - xScale(0)); })
                        .attr("height", yScale.bandwidth())
                        .on("mouseover", highlight)
                        .on("mouseout", dehighlight)
                        .on("mousemove", moveLabel);
        
        var chartTitle = d3.select(".graphTitle")
            .text("Change (%) in Enplanements During " + expressed + " per Airport");
        
        updateChart(bars,csvData.length,colorScale);
    }; //end of changeAttribute() function
    
    //function to position, size, and color bars in chart
    function updateChart(bars, n, colorScale){
        //position bars
        var bars = d3.selectAll(".bar")
                .attr("x", function(d) { return xScale(Math.min(0, d[expressed])); })
                .attr("y", function(d) { return yScale(d.IATA); })
                .attr("width", function(d) { return Math.abs(xScale(d[expressed]) - xScale(0)); })
                .attr("height", yScale.bandwidth())
                .style("fill", function(d){
                return choropleth(d, colorScale)
                });
    }; //end of updateChart() function
    
    //function to highlight enumeration units and bars
    function highlight(props){
        //change stroke
        var selected = d3.selectAll("." + props.IATA)
            .style("stroke", "blue")
            .style("stroke-width", "3")
            setLabel(props);
    };
    
    //function to reset the element style on mouseout
    function dehighlight(props){
        var selected = d3.selectAll("." + props.IATA)
            .style("stroke", function(){
                return getStyle(this, "stroke")
            })
            .style("stroke-width", function(){
                return getStyle(this, "stroke-width")
            });

        function getStyle(element, styleName){
            var styleText = d3.select(element)
                .select("desc")
                .text();

            var styleObject = JSON.parse(styleText);

            return styleObject[styleName];
        };
        d3.select(".infolabel")
        .remove();
    };
    
    //function to create dynamic label
    function setLabel(props){
        //label content
        var labelAttribute = props.IATA+"<br/><b>"+expressed+"</b><br/>"+"<h1>" + (props[expressed]*100) +"%"+
            "</h1>";

        //create info label div
        var infolabel = d3.select("body")
            .append("div")
            .attr("class", "infolabel")
            .attr("id", props.IATA + "_label")
            .html(labelAttribute);

        var regionName = infolabel.append("div")
            .attr("class", "labelname")
            .html(props.Airport);
    };
    
    //function to move info label with mouse
    function moveLabel(){
        //get width of label
        var labelWidth = d3.select(".infolabel")
            .node()
            .getBoundingClientRect()
            .width;

        //use coordinates of mousemove event to set label coordinates
        var x1 = d3.event.clientX + 10,
            y1 = d3.event.clientY - 75,
            x2 = d3.event.clientX - labelWidth - 10,
            y2 = d3.event.clientY + 25;

        //horizontal label coordinate, testing for overflow
        var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1; 
        //vertical label coordinate, testing for overflow
        var y = d3.event.clientY < 75 ? y2 : y1; 

        d3.select(".infolabel")
            .style("left", x + "px")
            .style("top", y + "px");
    };
    
})(); //last line of main.js