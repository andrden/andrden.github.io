//import {NoSleep} from './NoSleep.js';
// var noSleep = new NoSleep();
// console.log(noSleep);
let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
    deviceId = Math.round(100000 * Math.random()).toString();
    localStorage.setItem("deviceId", deviceId);
}
var firebaseConfig = {
    apiKey: "AIzaSyBzdDMv71fEwZzAZW6ATevAT9TWMbRveZg",
    authDomain: "app1-cfe36.firebaseapp.com",
    databaseURL: "https://app1-cfe36-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "app1-cfe36",
    storageBucket: "app1-cfe36.appspot.com",
    messagingSenderId: "1062099327891",
    appId: "1:1062099327891:web:582571408d3e4ed463a666"
};
firebase.initializeApp(firebaseConfig);

let wakeLock = null;
let map;
let resp = 0;
let errs = 0;
const coordsSet = new Set();
let feature;
let dbFeatures = new Map();
let playersRecent = 0;
let lastCoords;
let lastCoordsAsString = '';
let lastPlayerDistances = [];

function display() {
    //document.getElementById('txt').innerText = `pos=${resp} unique=${coordsSet.size} errs=${errs}`;
    document.getElementById('txt').innerText = `pos=${resp} unique=${coordsSet.size} db#=${dbFeatures.size} pl#=${playersRecent}`;
}

function watchMyLocation(button) {
    button.disabled = true;
    //noSleep.enable(); // https://github.com/richtr/NoSleep.js/blob/master/example/index.html
    requestWakeLock();
    navigator.geolocation.watchPosition((p) => {
        console.log('getCurrentPosition', p);
        resp++;
        lastCoords = p.coords;
        let coordsAsString = `lat=${p.coords.latitude} lng=${p.coords.longitude}`;
        if (lastCoordsAsString !== coordsAsString) {
            writeToDatabase(p.coords);
            lastCoordsAsString = coordsAsString;
        }
        coordsSet.add(coordsAsString);
        display();
        if (!feature) {
            feature = new ol.Feature(new ol.geom.Circle(ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude]), 30));
            feature.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({color: '#000'}),
                // fill: new ol.style.Fill({
                //     color: [150, 150, 255, 1]
                // })
            }));
            // feature = new ol.Feature({
            //     geometry: new ol.geom.Point(ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude]))
            // });
            var layer = new ol.layer.Vector({
                source: new ol.source.Vector({
                    features: [feature]
                })
            });
            map.addLayer(layer);
        } else {
            //feature.setGeometry(new ol.geom.Point(ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude])));
            feature.setGeometry(new ol.geom.Circle(ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude]), 30));
        }
        map.getView().setCenter(ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude]));
        //setTimeout(() => feature.setGeometry(new ol.geom.Point(ol.proj.fromLonLat([p.coords.longitude + 0.001, p.coords.latitude]))), 2000);
        //setTimeout(() => feature.setGeometry(new ol.geom.Circle(ol.proj.fromLonLat([p.coords.longitude + 0.001, p.coords.latitude]),20)), 2000);
    }, (e) => {
        errs++;
        console.log('getCurrentPosition error', e);
    }, {
        enableHighAccuracy: true,
        maximumAge: 5,
        //maximumAge: old ? Infinity : 0
    });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

function writeToDatabase(coords) {
    let newVar = {
        //...coords, - this doesn't work strangely
        t: Date.now(),
        tStr: new Date().toISOString(),
        ua: navigator.userAgent,
    };
    for (let key in coords) {
        if (typeof (coords[key]) === 'number') {
            newVar[key] = coords[key];
        }
    }
    console.log('writeToDatabase', deviceId, newVar);
    firebase.database().ref("quest/" + deviceId).set(newVar);
}

function readFromDatabaseOn() {
    firebase.database().ref("quest").on("value", (snapshot) => {
        let val = snapshot.val();
        console.log("snapshot", Object.keys(val).length, val);
        let players = 0;
        let playerDistances = []
        for (let key of Object.keys(val)) {
            //if (key === deviceId) continue;
            let coords = val[key];
            let lonLat = [coords.longitude, coords.latitude];
            const SECOND_MS = 1_000;
            const MINUTE_MS = 60_000;
            if (coords.t < Date.now() - 10 * MINUTE_MS) {
                // stale
                lonLat = [0, 0];
            } else {
                players++;
                if (lastCoords && key !== deviceId) {
                    playerDistances.push(10 * Math.round(100 * getDistanceFromLatLonInKm(coords.latitude, coords.longitude, lastCoords.latitude, lastCoords.longitude)))
                }
            }
            if (map) { // if map already initialized
                if (!dbFeatures.has(key)) {
                    let otherFeature = new ol.Feature(new ol.geom.Circle(ol.proj.fromLonLat(lonLat), 15));
                    var layer = new ol.layer.Vector({source: new ol.source.Vector({features: [otherFeature]})});
                    map.addLayer(layer);
                    dbFeatures.set(key, otherFeature)
                } else {
                    let otherFeature = dbFeatures.get(key);
                    otherFeature.setGeometry(new ol.geom.Circle(ol.proj.fromLonLat(lonLat), 15));
                }
                let otherFeature = dbFeatures.get(key);
                let styleObj = {
                    stroke: new ol.style.Stroke({color: '#000'}),
                    fill: new ol.style.Fill({color: key === deviceId ? [0, 0, 255, 1] : [255, 0, 0, 1]}),
                };
                let secondsStale = Math.round((Date.now() - coords.t) / SECOND_MS / 10) * 10;
                if (secondsStale > 30) {
                    // stale - phone locked? player cheating?
                    styleObj.text = new ol.style.Text({
                        text: secondsStale + " sec",
                        scale: 1.2,
                        fill: new ol.style.Fill({
                            color: "#f00"
                        }),
                        stroke: new ol.style.Stroke({
                            color: "0",
                            width: 3
                        })
                    });
                }
                otherFeature.setStyle(new ol.style.Style(styleObj));
            }
        }
        playersRecent = players;
        lastPlayerDistances = playerDistances;
    });
}

function speak() {
    console.log("speak", lastPlayerDistances)
    if (lastPlayerDistances.length > 0) {
        let utterance = new SpeechSynthesisUtterance(lastPlayerDistances.join(' and ') + " meters");
        utterance.volume = 1;
        speechSynthesis.speak(utterance);
    }
}

setInterval(speak, 10_000);
readFromDatabaseOn();

const requestWakeLock = async () => {
    try {
        wakeLock = await navigator.wakeLock.request('screen');

        // // change up our interface to reflect wake lock active
        // changeUI();
        //
        // // listen for our release event
        // wakeLock.onrelease = function(ev) {
        //     console.log(ev);
        // }
        // wakeLock.addEventListener('release', () => {
        //     // if wake lock is released alter the button accordingly
        //     changeUI('released');
        // });

    } catch (err) {
        // if wake lock request fails - usually system related, such as battery
        // wakeButton.dataset.status = 'off';
    }
}

const handleVisibilityChange = () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
}

document.addEventListener('visibilitychange', handleVisibilityChange);
