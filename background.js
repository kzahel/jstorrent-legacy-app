console.log('background.js')
var reload = chrome.runtime.reload
var MAINWIN = 'mainWindow2'
var _update_available = false
var extensionId = "bnceafpojmnimbnhamaeedgomdcgnbjk"
var session = null

function launch() {
    runtimeEvent({type:'onLaunched', data:{source:'debugger'}})
}

function runtimeEvent(event) {
    if (session) {
        session.registerEvent(event)
    } else {
        session = new jstorrent.Session(event)
    }
}
function setup_uninstall() {
    try {
        chrome.runtime.setUninstallURL('http://jstorrent.com/uninstall/?id=' + encodeURIComponent(chrome.runtime.id),
                                       function(result) {
                                           var lasterr = chrome.runtime.lastError
                                           if (lasterr) {
                                               console.warn('set uninstall url with result',result,'lasterr',lasterr)
                                           }
                                       }
                                      )
    } catch(e) {
        console.warn('error setting uninstall url',e)
    }
}

function fetchVersion() {
    var url = 'http://jstorrent.com/data/version.txt'
    function onload(evt) {
        console.log('fetch version response',evt)
        if (evt.target.status == 200) {
            var remoteversion = evt.target.response.trim()
            var curver = chrome.runtime.getManifest().version
            console.log('comparing server version',remoteversion,'to my version',curver)
            if (compareVersion(curver, remoteversion) < 0) {
                doShowUpdateAvailableDEV()
            }
        }
    }
    var xhr = new XMLHttpRequest
    xhr.onload = xhr.ontimeout = xhr.onerror = onload
    xhr.open("GET",url)
    xhr.send()
}
function compareVersion(version1, version2) {
    var a1 = version1.split('.').map(function(s){return parseInt(s)})
    var a2 = version2.split('.').map(function(s){return parseInt(s)})
    var n = Math.max(a1.length,a2.length)
    a1 = a1.concat( new Array(n-a1.length).fill(0) )
    a2 = a2.concat( new Array(n-a2.length).fill(0) )
    for (var i=0; i<n; i++) {
        if (a1[i] > a2[i]) {
            return 1
        } else if (a1[i] < a2[i]) {
            return -1
        }
    }
    return 0
}
function doShowUpdateAvailableDEV(details) {
    var msg = "Your version of " + chrome.i18n.getMessage("extName") + " is older than the one available in the Chrome Web Store. Install it there or manually update."
    chrome.notifications.create('update-available',
                                { title:chrome.i18n.getMessage("extName") + " Version Warning",
                                  type:"basic",
                                  priority:2,
                                  iconUrl: "/images/js-128.png",
                                  message:msg,
                                  buttons:[
                                      {title:"Install", iconUrl:"/images/cws_32.png"},
                                      {title:"Not now"}
                                  ]
                                }, function(id) {
                                    console.log('created notification with id',id,chrome.runtime.lastError)
                                })
    function onButtonClick(id, idx) {
        chrome.notifications.onButtonClicked.removeListener( onButtonClick )
        if (id == 'update-available') {
            if (idx == 0) {
                chrome.browser.openTab( { url: "https://chromewebstore.google.com/detail/jstorrent/anhdpjpojoipgpmfanmedjghaligalgb" } )
            } else if (idx == 1) {
                // nothing
            }
        }
        chrome.notifications.clear('update-available')
    }
    chrome.notifications.onButtonClicked.addListener( onButtonClick )
}
function doShowUpdateAvailable(details) {
    // even though priority 2 it's not showing up in foreground on CrOS (maybe because created in background page?)
    var msg = "An update is available and will be installed the next time you restart " + chrome.i18n.getMessage("extName")
    chrome.notifications.create('update-available',
                                { title:chrome.i18n.getMessage("extName") + " Update",
                                  type:"basic",
                                  priority:2,
                                  iconUrl: "/images/js-128.png",
                                  message:msg,
                                  buttons:[
                                      {title:"Install Now", iconUrl:"/images/cws_32.png"},
                                      {title:"Later", iconUrl:"/images/cws_32.png"}
                                  ]
                                }, function(id) {
                                    console.log('created notification with id',id,chrome.runtime.lastError)

                                })
    function onButtonClick(id, idx) {
        chrome.notifications.onButtonClicked.removeListener( onButtonClick )
        if (id == 'update-available') {
            if (idx == 0) {
                chrome.runtime.reload()
            }
        }
        chrome.notifications.clear('update-available')
    }
    chrome.notifications.onButtonClicked.addListener( onButtonClick )
}
function doShowUpdateNotification(details, history) {
    var currentVersion = details.cur
    var msg = chrome.i18n.getMessage("extName") + " has updated to version " + currentVersion

    chrome.notifications.create('update-installed',
                                { title:chrome.i18n.getMessage("extName") + " Updated",
                                  type:"basic",
                                  priority:2,
                                  iconUrl: "/images/js-128.png",
                                  message:msg,
                                  buttons:[
                                      {title:"View changes", iconUrl:"/images/cws_32.png"}
                                  ]
                                }, function(id) {
                                    console.log('created notification with id',id,chrome.runtime.lastError)

                                })
    function onButtonClick(id, idx) {
        chrome.notifications.onButtonClicked.removeListener( onButtonClick )
        if (id == 'update-installed') {
            var url = 'http://jstorrent.com/#changeLog'
            chrome.browser.openTab({url:url})
        }
        chrome.notifications.clear('update-installed')
    }
    chrome.notifications.onButtonClicked.addListener( onButtonClick )
}
function checkForUpdateMaybe() {
    function docheck() {
        console.log('check for update')
        chrome.storage.local.set({'lastUpdateCheck':Date.now()})
        if (DEVMODE) {
            fetchVersion()
        } else {
            chrome.runtime.requestUpdateCheck(function(result){
                console.log('update check:', result)
            })
        }
    }
    chrome.storage.local.get('lastUpdateCheck', function(d) {
        var lastcheck = d['lastUpdateCheck']
        var willcheck = false
        if (lastcheck) {
            if (Date.now() - lastcheck > 1000 * 60 * 20) {
                willcheck = true
            }
        } else {
            willcheck = true
        }
        if (willcheck) {
            docheck()
        } else {
            console.log('will not check for update')
        }
    })
}
function logError(err) { console.error(err) }
chrome.gcm.onSendError.addListener(function(err) {
    console.error('gcm send error',err)
})

function setupRTC(offerobj, cb) {
    //http://www.html5rocks.com/en/tutorials/webrtc/infrastructure/ steps 1--3 alice eve
    console.log('got offer',offerobj)
    var offer = new RTCSessionDescription(offerobj)
    window.peerconn = new webkitRTCPeerConnection({
        iceServers: [{ 'url': 'stun:stun.l.google.com:19302' }]})
    peerconn.setRemoteDescription(offer, function() {
        peerconn.createAnswer(function(answer) {
            peerconn.setLocalDescription(answer)
            peerconn.onicecandidate = function(evt) {
                console.log('ice candidate',evt)
                
            }
            
            console.log('created answer',answer)
            cb(answer)
        }, function(error) {
            console.log('yar')
        })
    })
}


function respondGCM(message, resp) {
    var data = {d:JSON.stringify(resp),
                'reqid':message.data.reqid
               }
    var msgid = makemsgid()
    var dst = jstorrent.gcm_appid+"@gcm.googleapis.com"
    chrome.gcm.send( {destinationId:dst,
                      messageId:msgid,
                      timeToLive: 20,
                      data:data
                     }, function(resp){
                         console.log(chrome.runtime.lastError,resp)
                         console.log('GCM respond',data)
                     })
}
function respondGCMChannel(channel, message) {
    var data = {'message':JSON.stringify(message),
                'channel':channel
               }
    var msgid = makemsgid()
    var dst = jstorrent.gcm_appid+"@gcm.googleapis.com"
    chrome.gcm.send( {destinationId:dst,
                      messageId:msgid,
                      timeToLive: 20,
                      data:data
                     }, function(resp){
                         //console.log(chrome.runtime.lastError,resp)
                         //console.log('GCM channel respond',data)
                     })
}

function DataChannel(channel){
    this.channel = channel
    var config = {"iceServers":[{"url":"stun:stun.l.google.com:19302"}]};
    //var conn_conf = { 'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true }] };
    //var conn_conf = { 'optional': [{'RtpDataChannels': true }] };
    var conn_conf = {}

    this.conn = new webkitRTCPeerConnection(config, conn_conf);
    this.conn.onicecandidate = function(e){
        if (!e || !e.candidate) return;
        var candidate = event.candidate;
        respondGCMChannel(this.channel, {type:'candidate', data:candidate})
    }.bind(this)
    this.conn.ondatachannel = function (e) {
        console.log('peerConnection.ondatachannel event fired.',e);
        this.setDataChannel(e.channel)
    }.bind(this);
}
DataChannel.prototype = {
    setDataChannel: function(dataChannel) {
        this.dataChannel = dataChannel
        dataChannel.onmessage = function(e){
            console.log("DC onmessage:",e.data)
        }
        dataChannel.onopen = function(){
            console.log("------ DATACHANNEL OPENED ------")
        };
        dataChannel.onclose = function(){console.log("------ DC closed! ------")};
        dataChannel.onerror = function(){console.log("DC ERROR!!!")};
    },
    setOfferCreateAnswer: function(data) {
        this.conn.setRemoteDescription(new RTCSessionDescription(data))
        var sdpConstraints = {'mandatory':
                              {
                                  'OfferToReceiveAudio': false,
                                  'OfferToReceiveVideo': false
                              }
                             };
        this.conn.createAnswer(function (sdp) {
            this.conn.setLocalDescription(sdp);
            respondGCMChannel(this.channel, {q:'webrtc',type:"answer", data:sdp})
            console.log("------ SEND ANSWER ------");
        }.bind(this), logError, sdpConstraints);
    },
    addCandidates: function(arr) {
        console.log('adding candidates')
        arr.forEach( function(c) {
            var cand = new RTCIceCandidate(c)
            console.log('adding cand',cand)
            this.conn.addIceCandidate(cand)
        }.bind(this) )
    }
}

var channels = {}
chrome.gcm.onMessage.addListener(function(message) {
    if (message.data.request) { message.data.request = JSON.parse(message.data.request) }
    if (message.data.message) { message.data.message = JSON.parse(message.data.message) }
    var request = message.data.request
    var channel = message.data.channel
    console.log("GCM onMessage",message.data)
    if (channel) {
        var msg = message.data.message
        // not a request-response type message
        if (! channels[channel])
            channels[channel] = {}
        var state = channels[channel]
        switch( msg.q ) {
        case 'webrtc':
            var type = msg.type
            var data = msg.data
            if (type == 'offer') {
                state.conn = new DataChannel(channel)
                state.conn.setOfferCreateAnswer(data)
            } else if (type == 'candidates') {
                state.conn.addCandidates(data)
            }
            break
        default:
            console.warn('unhandled channel message')
        }

    } else if (request) {
        switch (request.q) {
        case 'webrtc':
            if (request.type == 'offer') {
                setupRTC(request.data, function(answer) {
                    respondGCM(message, answer)
                })
            }
            break;
        case 'ping':
            // should also have reqid maybe.
            var resp = {'pong':'1','time':Date.now().toString()}
            respondGCM(message, resp)
            break
        case 'reload':
            chrome.runtime.reload()
        default:
            runtimeEvent({type:"gcmMessage", message:message})
        }
    }
});
chrome.gcm.onMessagesDeleted.addListener(messagesDeleted);

function messagesDeleted() {
    // All messages have been discarded from GCM. Sync with
    // your application server to recover from the situation.
}

chrome.runtime.onInstalled.addListener(function(details) {
    runtimeEvent({type:'onInstalled',data:details})
    //console.log('onInstalled',details)
    var sk = 'onInstalledInfo'
    chrome.storage.sync.get('sk', function(syncresp) {
    chrome.storage.local.get(sk, function(resp) {
        var showUpdateNotification = false
        //console.log('got previous install info',resp)

        var previous_updates = resp[sk]
        var changed = false
        var most_recent_update = null
        if (previous_updates && previous_updates.length > 0) {
            most_recent_update = previous_updates[previous_updates.length-1]
        }

        details.date = new Date().getTime()
        details.cur = chrome.runtime.getManifest().version

        if (syncresp['sk'] !== undefined) {
            showUpdateNotification = true
            chrome.storage.sync.remove("sk")
        }
        
        if (! previous_updates) {
            console.log('initializing install info')
            resp[sk] = [details]
            changed = true
        } else if (most_recent_update && most_recent_update.cur == details.cur) {
            // previousVersion missing?
        } else if (details.previousVersion == details.cur) {
            // happend because of chrome.runtime.reload probably
        } else {
            console.log('adding new install info',details)
            resp[sk].push(details)
            changed = true
            showUpdateNotification = true
        }

        if (resp[sk].length > 15) {
            // purge really old entries
            changed = true
            resp[sk].splice(0,1)
        }
        if (changed) {
            chrome.storage.local.set(resp, function(){console.log('persisted onInstalled info')})
        }

        if (showUpdateNotification) {
            doShowUpdateNotification(details, resp)
        }
    })
    })
    //details.reason // install, update, chrome_update
    //details.previousVersion // only if update
})

chrome.runtime.onUpdateAvailable.addListener( function(details) {
    // notify that there's a new version? click to restart? nah...
    console.log('a new version is available:',details.version,details)
    _update_available = true
    if (DEVMODE) {
        doShowUpdateAvailableDEV(details)
    } else {
        doShowUpdateAvailable(details)
    }
})

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('chrome runtime message',request,sender)
    if (request && request.command == 'openWindow') {
        chrome.browser.openTab({url:request.url})
    }
})

chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
    console.log('onMessageExternal',request,sender)
    if (request && request.command == 'checkInstalled') {
        sendResponse( {handled:true,
                       installed: true,
                       id: chrome.runtime.id,
                       version: chrome.runtime.getManifest().version})
        return
    } else if (request && request.command == 'add-url') {
        // External messages come from a browser Extension that adds a right click
        // context menu so that this App can handle magnet links.
        var info = {type:'onMessageExternal',
                    request: request,
                    sender: sender,
                    sendResponse: sendResponse}
        runtimeEvent(info)

        sendResponse({ handled: true, 
                       id: chrome.runtime.id, 
                       version: chrome.runtime.getManifest().version
                     })
    } else if (request && request.command == 'getStatus') {
        var resp = { version: chrome.runtime.getManifest().version
                   }
        var a = session
        if (a && a.client && a.client.webapp) {
            resp.webapp = a.client.webapp.get_info()
        }
        sendResponse(resp)
    } else {
        sendResponse({ handled: false,
                       id: chrome.runtime.id, 
                       version: chrome.runtime.getManifest().version,
                       message: 'unknown command' })
    }
});

chrome.runtime.onConnectExternal.addListener( function(port) {
    var authorized = true
    if (authorized) {
        console.log('received authorized port',port)
        try{
            if (window.mediaPort) {
                // disconnect the other port
                mediaPort.postMessage({error:"another port is opening"}) // might already be disconnected.
                mediaPort.disconnect()
            }
        }catch(e){
            console.warn("port was already disconnected")
        }
        window.mediaPort = port
        port.onMessage.addListener( function(msg) {
            var a = session
            if (a && a.client) {
                a.client.handleExternalMessage(msg, port)
            } else {
                port.postMessage({error:"no client"})
                console.warn('no client, could not handle external message')
            }
        })
        port.onDisconnect.addListener( function(msg) {
            console.log('external ondisconnect',msg)
            window.mediaPort = null
        })
        port.postMessage({text:"OK"})
    } else {
        console.error('unauthorized port',port)
        port.disconnect()
    }
})

chrome.runtime.onSuspend.addListener( function(evt) {
    runtimeEvent({type:'onSuspend',data:evt})
})

chrome.runtime.onSuspendCanceled.addListener( function(evt) {
    runtimeEvent({type:'onSuspendCanceled',data:evt})
})
/* // this will cause the background page to wake up every time it changes. not necessary
if (chrome.idle && chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.addListener( function(evt) {
        console.log('idle state changed',evt)
    })
}*/

chrome.runtime.onStartup.addListener( function(evt) {
    runtimeEvent({type:'onStartup',data:evt})
    console.log('onStartup',evt)
})

chrome.app.runtime.onLaunched.addListener(function(data) {
    var info = {type:'onLaunched',
                data: data}
    runtimeEvent(info)
});

chrome.app.runtime.onRestarted.addListener( function(evt) {
    runtimeEvent({type:'onRestarted',data:evt})
    console.log('app onRestarted',evt)
})

if (chrome.runtime.setUninstallURL && ! DEVMODE) {
    setup_uninstall()
}


// console.assert(chrome.app.window.getAll().length == 0)
