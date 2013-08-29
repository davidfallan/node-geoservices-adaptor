var map = null,
	worldLayerName = "world",
	bikeshareLayerName = "local",
	urlRoot = location.protocol + "//" + location.host,
	worldLayerURL = "/citybikes/rest/services/world_bikeshares/FeatureServer/1",
	worldLayer = null,
	bikeshareLayer = null,
	lastWorldExtent = null,
	extentHandler = null,
	switchScale = 500000,
	defaultZoom = 3,
	defaultCenter = [-35, 25],
	worldText = "World Bikeshare View";

var mapOptions = {
		basemap: "gray",
		sliderStyle: "small",
		wrapAround180: true,
		center: defaultCenter,
		zoom: defaultZoom
	},
	bikesharePopupTemplate = null;

function pathStrings(pieData) {
	var total = pieData.reduce(function (accu, that) { return that + accu; }, 0);
    var sectorAngleArr = pieData.map(function (v) { return 360 * v / total; });

	var radius = 7,
		centerX = 0,
		centerY = 0;
	var paths = [];

    var startAngle = 0;
    var endAngle = 0;
    for (var i=0; i<sectorAngleArr.length; i++){
        startAngle = endAngle;
        endAngle = startAngle + sectorAngleArr[i];

        var x1,x2,y1,y2 ;

        x1 = parseInt(Math.round(centerX + radius*Math.cos(Math.PI*startAngle/180)));
        y1 = parseInt(Math.round(centerY + radius*Math.sin(Math.PI*startAngle/180)));

        x2 = parseInt(Math.round(centerX + radius*Math.cos(Math.PI*endAngle/180)));
        y2 = parseInt(Math.round(centerY + radius*Math.sin(Math.PI*endAngle/180)));

        var d = "M" + centerX + "," + centerY + 
        		"  L" + x1 + "," + y1 + 
        		"  A" + radius + "," + radius + " 0 " + 
                ((endAngle-startAngle > 180) ? 1 : 0) + ",1 " + x2 + "," + y2 + " z";
        paths.push(d);
        //alert(d); // enable to see coords as they are displayed
// 		var c = parseInt(i / sectorAngleArr.length * 360);
// 		var arc = makeSVG("path", {d: d, fill: "hsl(" + c + ", 66%, 50%)"});
// 		paper.appendChild(arc);
// 		arc.onclick = clickHandler; // This is optional, of course
    }
    return paths;
}

function createSymbol(path, color) {
	var markerSymbol = new esri.symbol.SimpleMarkerSymbol();
	markerSymbol.setPath(path);
	markerSymbol.setColor(new dojo.Color(color));
	markerSymbol.setOutline(null);
	return markerSymbol;
}

function getParameterByName(name) {
	name = name.replace(/[\[]/, "\[").replace(/[\]]/, "\]");
	var regex = new RegExp("[\?&]" + name + "=([^&#]*)"),
		results = regex.exec(location.search);
	return results == null ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function getExtent(layerEndpoint, callback) {
    var featureServiceDescriptionUrl = layerEndpoint + "?f=json";
    var jsonfile = new XMLHttpRequest();
    jsonfile.open("GET", featureServiceDescriptionUrl, true);
    jsonfile.onreadystatechange = function() {
        if (jsonfile.readyState == 4) {
            if (jsonfile.status == 200) {
                require(["esri/geometry/Extent"], function(Extent) {
                    var extent = JSON.parse(jsonfile.responseText).extent;
                    extent = new Extent(extent);
                    return callback(null, extent);
                });
            } else {
                return callback("Could not get extent", null);
            }
        }
    };
    jsonfile.send(null);
}

function openBikeshareLayer(g) {
	var url = g.attributes.url;
	lastWorldExtent = map.extent;
	getExtent(url, function(err, extent) {
		if (!err) {
			if (extentHandler) {
				extentHandler.remove();
			}
			require(["esri/layers/FeatureLayer", "esri/InfoTemplate"],
					function(FeatureLayer, InfoTemplate) {
				if (bikeshareLayer) {
					map.removeLayer(bikeshareLayer);
					delete bikeshareLayer;
				}
				bikeshareLayer = new FeatureLayer(url, {
                    infoTemplate: new InfoTemplate("${name}",
                    	"<tr>Bikes: <td>${bikes}</td></tr><br>" + 
                    	"<tr>Docks: <td>${free}</td></tr>")
                });
				bikeshareLayer.world_network_details = g.attributes;
				bikeshareLayer.setMinScale(switchScale);
				map.addLayer(bikeshareLayer);
				map.setExtent(extent, true);
			});
		} else {
			console.log("Error loading layer! " + err);
		}
	});
}

function openWorldLayer() {
	require(["esri/layers/FeatureLayer", "esri/renderers/SimpleRenderer", "esri/symbols/SimpleMarkerSymbol"], 
			function(FeatureLayer, SimpleRenderer, SimpleMarkerSymbol) {
		if (!worldLayer) {
			document.getElementById("titleMessage").innerText = worldText;
			worldLayer = new FeatureLayer(worldLayerURL);
			worldLayer.setMaxScale(switchScale);
			map.addLayer(worldLayer);
			worldLayer.on("click", function(e) {
				var g = e.graphic;
				if (g) {
					openBikeshareLayer(g);
				}
			});
			worldLayer.on("scale-visibility-change", function(e) {
				if (worldLayer.isVisibleAtScale(map.getScale())) {
					document.getElementById("titleMessage").innerText = worldText;
					map.infoWindow.hide();
				} else {
					var details = bikeshareLayer.world_network_details;
					document.getElementById("titleMessage").innerText = 
						details.name + 
						" (" + details.docks + "," + details.bikes + ")";
				}
			});
			var renderer = new SimpleRenderer(new SimpleMarkerSymbol());
			renderer.getSymbol = function(graphic) {
				var docks = graphic.attributes.docks,
					bikes = graphic.attributes.bikes,
					paths = pathStrings([docks, bikes]);
				for (var i=0; i<paths.length; i++) {
					console.log(paths[i]);
				}
				return createSymbol(paths[0], [255,0,0]);
			}
			worldLayer.renderer = renderer;
		}

		if (lastWorldExtent) {
			map.setExtent(lastWorldExtent);
		} else {
			map.centerAndZoom(defaultCenter, defaultZoom);
		}
	});
}

function initApp() {
	require(["esri/map", "esri/dijit/InfoWindowLite", "esri/InfoTemplate", 
			 "dojo/dom-construct", "dojo/domReady!"], 
			function(Map, InfoWindowLite, InfoTemplate, domConstruct) {
		map = new Map("map", mapOptions);

		var parameterRoot = getParameterByName("urlroot");
		if (parameterRoot) {
			urlRoot = parameterRoot;
		}

		worldLayerURL = urlRoot + worldLayerURL;

		var infoWindow = new InfoWindowLite(null, domConstruct.create("div", null, null, map.root));
		infoWindow.startup();
		map.setInfoWindow(infoWindow);
		map.infoWindow.resize(200, 75);

		map.on("load", function() {
			openWorldLayer();
			document.getElementById("btnBackToWorldView").onclick = openWorldLayer;
		});
	});
}

initApp();
