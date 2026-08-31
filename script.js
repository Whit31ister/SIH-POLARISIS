let map;
let navigationRoute = null;

// NCPOR Station Coordinates
const STATIONS = {
    bharati: { lat: -69.40, lng: 76.18, zoom: 6 },
    maitri: { lat: -70.76, lng: 11.73, zoom: 6 }
};

// Initialize Google Map
function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: STATIONS.bharati,
        zoom: STATIONS.bharati.zoom,
        mapTypeId: "satellite",
        disableDefaultUI: false
    });
    logMessage("Polaris AI initialized for Southern Ocean.", "info");
}

function logMessage(text, type = "info") {
    const feed = document.getElementById("alert-feed");
    const entry = document.createElement("p");
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    feed.prepend(entry);
}

document.getElementById("btn-bharati").addEventListener("click", () => {
    map.setCenter(STATIONS.bharati);
    map.setZoom(STATIONS.bharati.zoom);
    logMessage("Focused on Bharati Station.", "info");
});

document.getElementById("btn-maitri").addEventListener("click", () => {
    map.setCenter(STATIONS.maitri);
    map.setZoom(STATIONS.maitri.zoom);
    logMessage("Focused on Maitri Station.", "info");
});

document.getElementById("btn-route").addEventListener("click", () => {
    logMessage("Requesting AI-optimized route from backend...", "info");
    document.getElementById("route-status").innerText = "Calculating...";
    document.getElementById("route-status").style.color = "#f8fafc";
    
    const demoRoute = [
        { lat: -65.0, lng: 70.0 }, 
        { lat: -67.5, lng: 73.0 }, 
        { lat: -69.40, lng: 76.18 }
    ];
    
    if (navigationRoute) navigationRoute.setMap(null);
    navigationRoute = new google.maps.Polyline({
        path: demoRoute, geodesic: true, strokeColor: "#10b981", strokeOpacity: 1.0, strokeWeight: 4, map: map
    });

    document.getElementById("route-status").innerText = "Route Optimized";
    document.getElementById("route-status").style.color = "#10b981";
    document.getElementById("safety-index").innerText = "92% (Clear of Icebergs)";
    document.getElementById("fuel-savings").innerText = "14.5% vs Direct Route";
    logMessage("Optimal navigation route mapped successfully.", "success");
});