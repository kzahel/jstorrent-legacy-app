// this file should probably be in "gui"

// rather should have a better separation ...

function App(opts) {
    //console.log('creating app')
    this.id = 'app01' // device ID...
    if (chrome.system && chrome.system.storage) {
        chrome.system.storage.onAttached.addListener( _.bind(this.external_storage_attached, this) )
        chrome.system.storage.onDetached.addListener( _.bind(this.external_storage_detached, this) )
    }

    this.sessionState = {} // session state that only exists for the lifetime of this app run

    this.options_window = null
    this.help_window = null
    this.options = new jstorrent.Options({app:this}); // race condition, options not yet fetched...
    //this.dht = new jstorrent.DHT // not ready yet!

    var handlers = [
        ['/favicon.ico',jstorrent.FavIconHandler],
        ['/stream.*',jstorrent.StreamHandler],
        ['/package/(.*)',jstorrent.PackageHandler]
//        ['.*', jstorrent.WebHandler]
    ]
    if (opts && opts.tab) {
        this.webapp = null
        // dont start server for browser tab instance
    } else if (chrome.WebApplication) { // temporarily disabled, too buggy
        // :-( options not yet loaded
        // let this work without submodule
        this.webapp = new chrome.WebApplication({host:'0.0.0.0',handlers:handlers, port:8543})
    } else {
        this.webapp = null
    }

    this.analytics = new jstorrent.Analytics({app:this})
    this.entryCache = new jstorrent.EntryCache
    this.fileMetadataCache = new jstorrent.FileMetadataCache

    // need to store a bunch of notifications keyed by either torrents or other things...
    this.notificationCounter = 0
    this.notifications = new jstorrent.Collection({parent:this, shouldPersist: false})
    chrome.notifications.onClicked.addListener(_.bind(this.notificationClicked, this))
    chrome.notifications.onButtonClicked.addListener(_.bind(this.notificationButtonClicked, this))
    chrome.notifications.onClosed.addListener(_.bind(this.notificationClosed, this))
    chrome.contextMenus.onClicked.addListener(_.bind(this.onContextMenuClick, this))

    this.popupwindowdialog = null // what it multiple are triggered? do we queue up the messages?
    // maybe use notifications instead... ( or in addition ... )
    this.UI = null

    this.freeTrialFreeDownloads = 20

    chrome.i18n.getAcceptLanguages(this.onAcceptLanguages.bind(this))

    this.totalDownloads = 0
    this.minimized = false
    this.popup_windows = {}

    // store random shit in sync app attributes. like if user clicked on my stupid "please rate me"
    this.syncAppAttributes = null
    chrome.storage.sync.get(this.id + '/syncAppAttributes', _.bind(function(d) {
        this.syncAppAttributes = d[this.id + '/syncAppAttributes'] || {} // place to store random stuff
        console.log('received sync app attributes', this.syncAppAttributes)
    },this))

    this.updateRemainingDownloadsDisplay()

    $('#url-btn').click( function(evt) {
        console.log('url-btn click')
        var url = $('#url').val()
        if (! url) {
            console.log('add button clicked with no URL entered, popup select file dialog')
            this.select_torrent()
            // open file chooser...

            evt.preventDefault()
            evt.stopPropagation()
        }
    }.bind(this))

    if (this.isLite()) {
        $('#download-remain-container').show()
        $('#title-lite').show()
        $('#button-sponsor').hide()
    } else if (this.isUnpacked()) {
        $('#unpacked-container').show()
    }
}

jstorrent.App = App

App.prototype = {
    close: function() {
        // app wants to close
        // maybe do some cleanup stuff?
        if (this.webapp) {
            this.webapp.stop()
        }
        this.unminimize()
        window.close()
    },
    minimize: function() {
        if (this.minimized) { return }
        var cw = chrome.app.window.current()
        // destroy the UI and make the window small and save current window state and stuff
        this.minimized = true
        this.minimizedRestore = cw.getBounds() // persist this so that when we close in minimized mode it doesnt use these bounds
        //cw.setMinWidth(270) // dont work yet in dev channel
        cw.resizeTo(275 + 16, 100)
        //cw.moveTo(10000, 10000)
        $('#top-titlebar-min').text("Full")
        $('#top-titlebar-icon').show()
        this.UI.destroy()

        this.minUI = new jstorrent.MinUI({client:this.client})
    },
    unminimize: function() {
        if (! this.minimized) { return }
        if (this.minUI) {
            this.minUI.destroy()
        }
        var cw = chrome.app.window.current()
        this.minimized = false
        //cw.setMinWidth(770) // not supported
        $('#top-titlebar-min').text("Compact")
        $('#top-titlebar-icon').hide()
        cw.resizeTo(Math.max(770, this.minimizedRestore.width),
                    Math.max(400, this.minimizedRestore.height))
        cw.moveTo(this.minimizedRestore.left,this.minimizedRestore.top)
        this.UI.undestroy()
    },
    runtimeMessage: function(msg) {
        console.warn('runtime message!',msg)
        if (msg == 'onSuspend') {
            console.error("APP ABOUT TO CRASH!! EEE!!!")


            if (this.client.get('numActiveTorrents') == 0) {
                app.analytics.sendEvent('runtime','onSuspend','noActiveTorrents')
                app.createNotification({message:"JSTorrent Closing",
                                        priority:2,
                                        details:"ChromeOS terminates an app that is not kept in the foreground. Since no torrents are active, the app will automatically close."})
                setTimeout( function() {
                    window.close()
                }, 6000 )
            } else {
                app.analytics.sendEvent('runtime','onSuspend','ActiveTorrents',this.client.get('numActiveTorrents'))
                app.createNotification({message:"JSTorrent Suspended",
                                        priority:2,
                                        details:"ChromeOS terminates an app that is not kept in the foreground. Sorry about the inconvenience. You can prevent the suspend event by keeping the JSTorrent window visible on your screen. The app will now restart so your downloads can continue."})
                setTimeout( function() {
                    chrome.runtime.reload() // reloading app
                }, 6000 )
            }

            // stop listening, destroy all sockets
            if (this.webapp) {
                this.webapp.stop()
            }
            this.unminimize()
        }
    },
    on_options_loaded: function() {
        if (this.options.get('web_server_enable')) {
            if (this.webapp) {
                this.webapp.start() // TODO -- try to listen on different ports if listen fails
            }
        }
    },
    onContextMenuNoItem: function(grid, info, evt) {
        window.contextMenuContextItem = info
        console.log('oncontextmenunoitem',info)
        chrome.contextMenus.removeAll()
        if (info.collection.itemClass == jstorrent.Tracker) {
            var opts = {
                contexts:["all"],
                title:"Add Custom Tracker",
                id:"add-custom-tracker"
            }
            chrome.contextMenus.create(opts)
        }
        return true
    },
    onContextMenu: function(grid, item, evt) {
        console.log('oncontextmenu',item)
        chrome.contextMenus.removeAll()
        if (item.itemClass == jstorrent.Torrent) {
            if (jstorrent.options.allow_report_torrent_bug) {

                var opts = {
                    contexts:["all"],
                    title:"Report Issue with this Torrent",
                    id:"reportTorrentIssue"
                }
                window.contextMenuContextItem = item
                chrome.contextMenus.create(opts, _.bind(this.onContextMenuCreate,this) )
            }
        } else if (item.itemClass == jstorrent.File) {
            window.contextMenuContextItem = item
            var opts1 = {
                contexts:["all"],
                title:"Skip Download",
                id:"skip-download"
            }
            var opts2 = {
                contexts:["all"],
                title:"Normal Download",
                id:"normal-download"
            }
            chrome.contextMenus.create(opts2)
            chrome.contextMenus.create(opts1)
        }
        return true
    },
    onContextMenuCreate: function(c) {
        console.log('created contextmenu', c)

    },
    onContextMenuClick: function(c) {
        chrome.contextMenus.removeAll(function(){})
        console.log('contextmenuclick',c,c.menuItemId)
        var item = window.contextMenuContextItem
        window.contextMenuContextItem = null
        if (c.menuItemId == 'reportTorrentIssue') {
            var torrent = item
            var data = {data:torrent.getSaveData()}

            this.focus_or_open('issue', function(win) {

                if (win.contentWindow.sendItem) {
                        win.contentWindow.sendItem(item)
                } else {
                    win.contentWindow.addEventListener('DOMContentLoaded',function() {
                        win.contentWindow.sendItem(item)
                    })
                }
            })
        } else if (c.menuItemId == 'normal-download') {
            var files = app.UI.get_selected_files()
            for (var i=0; i<files.length; i++) {
                var file = files[i]
                file.torrent.setFilePriority(file.num, 1, file.getPriority())
            }
        } else if (c.menuItemId == 'skip-download') {
            var files = app.UI.get_selected_files()
            for (var i=0; i<files.length; i++) {
                var file = files[i]
                file.torrent.setFilePriority(file.num, 0, file.getPriority())
            }
        } else if (c.menuItemId == 'add-custom-tracker') {
            console.log('add custom tracker now...')
            app.createWindowCustomTracker(item)
        }
    },
    onAcceptLanguages: function(s) {
        // detect if
        app.analytics.sendEvent('acceptLanguages',window.navigator.language,s)
        if (_.contains(['pt-BR'], window.navigator.language)) {
            this.freeTrialFreeDownloads = 999
        }

        if (this.isUnpacked()) {
            this.freeTrialFreeDownloads = 99999
        }

    },
    setSyncAttribute: function(k,v, callback) {
        if (this.syncAppAttributes) {
            this.syncAppAttributes[k] = v
            var obj = {}
            obj[this.id + '/syncAppAttributes'] = this.syncAppAttributes
            chrome.storage.sync.set(obj,callback)
        } else {
            console.warn('had not yet fetched sync app attributes... perhaps network is down. this will fail.')
        }
    },
    closeNotifications: function() {
        this.notifications.each( function(n) {
            n.close()
        })
    },
    initialize_client: function() {
        console.log('app:initialize_client')
        this.client = new jstorrent.Client({app:this, id:'client01'});
        this.client.torrents.on('error', _.bind(this.onTorrentError, this))
        this.client.torrents.on('started', _.bind(this.onTorrentStart, this))
        this.client.torrents.on('havemetadata', _.bind(this.onTorrentHaveMetadata, this))
        this.client.torrents.on('stopped', _.bind(this.onTorrentStop, this))
        this.client.torrents.on('progress', _.bind(this.onTorrentProgress, this))
        this.client.torrents.on('complete', _.bind(this.onTorrentComplete, this))
        this.client.on('error', _.bind(this.onClientError, this))
    },
    reinstall: function() {
        chrome.storage.local.clear(function() {
            reload()
        })
    },
    upgrade: function() {
        // used to test "upgrade" from previous jstorrent (pre-rewrite) version.
        chrome.storage.local.clear(function() {
            var obj = {}
            obj[jstorrent.constants.keyPresentInPreRewrite] = true
            chrome.storage.local.set(obj, function(){
                reload()
            })
        })
    },
    notifyStorageError: function() {
        this.createNotification({details:'There seems to be a problem with the disk for this torrent. Is it attached? You can reset the disk for this torrent in the "More Actions" in the toolbar. This could just be the disk was too slow, and you can try again.',
                                 priority:2,
                                 id:'storage-missing'})
    },
    notifyMissingDisk: function(diskKey, folderName) {
        function onclick(idx) {
            if (idx == 0) {
                
            } else {
                var disk = this.client.disks.get(diskKey)
                disk._collections[0].remove(disk)
            }
        }
        this.createNotification({ details:"Unable to locate download directory: " + folderName,
                                  message: "Missing directory",
                                  buttons: [
                                      {title:"Keep directory (default)"},
                                      {title:"Remove directory"}
                                  ],
                                  id:'directory-missing-' + diskKey,
                                  priority:1,
                                  onButtonClick: _.bind(onclick,this),
                                  onClick: _.bind(onclick,this) })
    },
    notifyWantToAddPublicTrackers: function(torrent) {
        if (torrent.isPrivate()) {
            this.createNotification({ details:"No peers were received from the private tracker. Support for private trackers is limited. You may want to try to enable spoofing in the app options."})
            return
        }
        if (! app.client.torrents.contains(torrent)) { return }
        function onclick(idx) {
            if (idx == 1) {
                
            } else {
                app.analytics.sendEvent("Torrent", "Tracker","addPublicTrackers")
                torrent.addPublicTrackers()
                torrent.forceAnnounce()
            }
        }
        this.createNotification({ details:"No peers were received from any trackers. Unable to download. Try a more popular torrent or a different torrent site. Or you can:",
                                  message: torrent.get('name'),
                                  buttons: [
                                      {title:"Add public trackers and reattempt"},
                                      {title:"Do nothing"}
                                  ],
                                  id:'tracker-error-' + torrent.hashhexlower,
                                  priority:1,
                                  onButtonClick: _.bind(onclick,this),
                                  onClick: _.bind(onclick,this) })
    },
    notifyNoDownloadsLeft: function() {
        function onclick(idx) {
            console.log('notification clicked',idx)
            if (idx == 1) {
                this.open_upsell_page()
            } else {
                window.open(jstorrent.constants.cws_jstorrent_url,'_blank')
            }
        }
        this.createNotification({ details:"Sorry, this is the free trial version, and you have used all your free downloads",
                                  buttons: [
                                      {title:"Get JSTorrent Full Version", iconUrl:"/cws_32.png"},
                                      {title:"Why do I have to pay?"},
                                  ],
                                  id:'no-downloads-left',
                                  priority:2,
                                  onButtonClick: _.bind(onclick,this),
                                  onClick: _.bind(onclick,this) })
    },
    handle_click: function(type, collection, evt, info) {
        var file = collection.items[info.row]
        var column = UI.coldefs.files[info.cell]
        if (type == 'files') {
            console.log('clicked in files',file, info.cell)
            if (evt.target.tagName == 'A' && column.name == 'Action') {
                // clicking on file action (like Play)
                if (file.streamable()) {
                    if (file.isComplete()) {
                        var url = file.getPlayerURL()
                        var msg = {command:'openWindow',url:url}
                        chrome.runtime.sendMessage(msg)
                    } else {
                        window.open( file.torrent.getStreamPlayerPageURL(file.num) )
                    }
                } else {
                    file.getPlayableSRCForVideo( function(url) {
                        var msg = {command:'openWindow',url:url}
                        chrome.runtime.sendMessage(msg)
                    })
                }
            }
        }
    },
    handle_dblclick: function(type, collection, evt, info) {
        console.log('dblclick',type,collection, evt, info)
        var item = collection.items[info.row]
        if (type == 'peers') {
            if (item) {
                item.close('user click')
            }
        } else if (type == 'swarm') {
            if (item) {
                var peer = item
                var torrent = peer.torrent
                var peerconn = new jstorrent.PeerConnection({peer:peer})
                //console.log('should add peer!', idx, peer)
                if (! torrent.peers.contains(peerconn)) {
                    torrent.peers.add( peerconn )
                    torrent.set('numpeers',torrent.peers.items.length)
                    peerconn.connect()
                }

            }
        }
    },
    highlightTorrent: function(hashhexlower) {
        var row = this.client.torrents.keyeditems[hashhexlower]
        if (this.UI) {
            this.UI.torrenttable.grid.scrollRowIntoView(row);
            this.UI.torrenttable.grid.flashCell(row, 0, 500);
        }
    },
    pulsate: function() {
        $('#button-options').twinkle(
            { effect:'drop-css',
              effectOptions: {radius:150},
              callback: function(){}
            }
        )
    },
    pulsateOptions: function() {
        this.pulsating = setInterval( this.pulsate, 2000 )
        this.pulsate()
    },
    stopPulsateOptions: function() {
        if (this.pulsating) {
            clearInterval(this.pulsating)
        }
    },
    notifyNeedDownloadDirectory: function() {
        // pulsate the options button?
        this.pulsateOptions()

        // need to change this to also bring the notification back to the foreground (because users find a way to have it stay hidden)
        this.createNotification({details:jstorrent.strings.NOTIFY_NO_DOWNLOAD_FOLDER,
                                 priority:2,
                                 id: 'notifyneeddownload', // this means if it was already shown or dismissed, it wont show again..
                                 onClick: _.bind(function() {
                                     this.stopPulsateOptions()
                                     chrome.fileSystem.chooseEntry({type:'openDirectory'},
                                                                   _.bind(this.set_default_download_location,this)
                                                                  )
                                     
                                 },this)})
    },
    checkIsExtensionInstalled: function(callback) {
        chrome.runtime.sendMessage(jstorrent.constants.cws_jstorrent_extension, {command:'checkInstalled'}, function(response) {
            console.log('checked if extension installed:',response,chrome.runtime.lastError)
            var present = false
            if (response && response.installed) {
                present = true
            }
            if (callback){callback(present)}
        })
    },
    registerLaunchData: function(launchData) {
        if (this.client.ready) {
            this.client.handleLaunchData(launchData)
        } else {
            this.client.on('ready', _.bind(function() {
                this.client.handleLaunchData(launchData)
            },this))
        }
    },
    notificationClosed: function(id, byUser) {
        //console.log('closed notification with id',id)
        var notification = this.notifications.get(id)
        if (notification) {
            this.notifications.remove(notification)
        }
    },
    notificationClicked: function(id) {
        //console.log('clicked on notification with id',id)
        var notification = this.notifications.get(id)
        notification.handleClick()
    },
    notificationButtonClicked: function(id, idx) {
        //console.log('clicked on notification with id',id)
        var notification = this.notifications.get(id)
        notification.handleButtonClick(idx)
    },
    createNotification: function(opts) {
        opts.id = opts.id || ('notification' + this.notificationCounter++)
        //console.log('createNotification', opts.id)
        opts.parent = this
        if (! this.notifications.containsKey(opts.id)) {
            var notification = new jstorrent.Notification(opts)
            this.notifications.add(notification)
        } else {
            var notification = this.notifications.get(opts.id)
            notification.updateTimestamp()
        }
    },
    showPopupWindowDialog: function(details) {
        this.createNotification({details:details})
    },
    onTorrentHaveMetadata: function(torrent) {
        if (this.UI && this.UI.get_selected_torrent() == torrent) {
            // reset the detail view (works for files view, general view)
            this.UI.set_detail(this.UI.detailtype, torrent)
        }
    },
    onTorrentComplete: function(torrent) {
        console.log('onTorrentComplete')
        var id = torrent.hashhexlower

        // no way to cause the progress notification to come to
        // foreground, so delete it and create a new one

        if (this.notifications.get(id)) {
            // remove the progress notification
            chrome.notifications.clear(id, function(){})
        }

        if (this.options.get('show_progress_notifications')) {
            this.createNotification({details:torrent.get('name') + " finished downloading!",
                                     message:"Download Complete!",
                                     id:id+'/complete',
                                     priority:1})
        }
        // increment total downloads ...

        this.incrementTotalDownloads( _.bind(function() {
            this.updateRemainingDownloadsDisplay()
        },this))

        if (jstorrent.options.reset_on_complete) {
            setTimeout( function() {
                torrent.resetState()
            }, 4000 )
        }
    },
    updateRemainingDownloadsDisplay: function() {
        // bother the user every N downloads with a link to the chrome web store and let them write a review...

        this.getTotalDownloads( _.bind(function(val) {
            this.totalDownloads = val
            $('#download-remain').text(this.freeTrialFreeDownloads - val)
        },this))
    },
    canDownload: function() {
        if (! this.isLite()) { return true }
        return this.totalDownloads < this.freeTrialFreeDownloads
    },
    getTotalDownloads: function(callback) {
        chrome.storage.sync.get('totalDownloads', _.bind(function(resp) {
            callback( resp['totalDownloads'] || 0 )
        },this))
    },
    incrementTotalDownloads: function(callback) {
        chrome.storage.sync.get('totalDownloads', _.bind(function(resp) {
            var obj = {}
            obj['totalDownloads'] = (resp['totalDownloads'] || 0) + 1
            chrome.storage.sync.set( obj, callback)
        },this))
    },
    isLite: function() {
        return chrome.runtime.id == jstorrent.constants.cws_jstorrent_lite
    },
    isUnpacked: function() {
        return ! _.contains([jstorrent.constants.cws_jstorrent,
                             jstorrent.constants.cws_jstorrent_lite], chrome.runtime.id)
    },
    onTorrentProgress: function(torrent) {
        if (jstorrent.device.platform === 'Android') { return } // progress notification broken on android

        var id = torrent.hashhexlower

        if (this.notifications.get(id)) {
            chrome.notifications.update(id,
                                        {progress: Math.floor(100 * torrent.get('complete'))},
                                        function(){})
        }

        // maybe best time to pop up a "please review me" notification
        // is when the torrent is nearly but not yet complete
        if (this.totalDownloads > 2 && ! this.sessionState['pleaseReview']) {
            this.sessionState['pleaseReview'] = 1
            this.createPleaseReviewMeNotification()
        }
    },
    onTorrentStop: function(torrent) {
        var id = torrent.hashhexlower
        if (this.notifications.get(id)) {
            chrome.notifications.clear(id, function(){})
        }
    },
    onTorrentError: function(torrent, err, msg, seedingError) {
        this.sessionState['haderror'] = true

        // TODO -- we are handling torrent error notificationsin too many places!

        if (err == 'Disk Missing') {
            err = 'Disk Missing. Choose a download directory in the options. Or remove it and add it again.'
        }

        console.error('onTorrentError',arguments)

        //if (err === undefined) { debugger }
        this.createNotification({
            message: torrent.get('name'),
            details: "Error with torrent: " + err + ((msg&&typeof msg=='string')?(','+msg):''),
            priority: 1
        })


        if (this.options.get('restart_torrent_on_error')) {
            // XXX delete this its crap
            if (err == 'error persisting piece: timeout') {
                // other types of errors, dont restart
                if (! seedingError && torrent.stopinfo && torrent.stopinfo.reason == 'error') {
                    _.delay( function() { torrent.start() } )
                }
            }
        }
        // option to re-start on an error!

        app.analytics.sendEvent('Torrent','Error',err)
        //console.log('torrent->error event->app',err)
    },
    onTorrentStart: function(torrent) {
        if (torrent.get('complete') == 1) { return }
        var id = torrent.hashhexlower
        if (this.notifications.get(id)) {
            // already had this notification... hrmmm
        } else {
            if (this.options.get('show_progress_notifications')) {
                var opts = {type: 'progress',
                            message: "Download in Progress",
                            progress: Math.floor(100*torrent.get('complete')),
                            details: torrent.get('name'),
                            id: id}
                this.createNotification(opts)
            }
        }
    },
    onClientError: function(evt, e) {
        this.sessionState['haderror'] = true
        // display a popup window with the error information
        this.createNotification({details:e, priority:1})
    },
    set_ui: function(UI) {
        this.UI = UI
    },
    set_minui: function(minUI) {
        this.minUI = minUI
    },
    handleDrop: function(evt) {
        console.log('handleDrop')
        //app.analytics.sendEvent("MainWindow", "Drop")
        // handle drop in file event
        var files = evt.dataTransfer.files, file, item
        var file

        if (files) {
            for (var i=0; i<files.length; i++) {
                file = files[i]
                console.log('drop found file (but use FileEntry instead)',file)
                // check if ends in .torrent, etc...
            }
        }
        var items = evt.dataTransfer.items
        if (items) {
            for (var i=0; i<items.length; i++) {
                item = items[i]
                //console.log('drop found item',item)
                if (item.kind == 'file') {
                    var entry = item.webkitGetAsEntry()
                    //console.log('was able to extract entry.',entry)
                    if (item.type == 'application/x-bittorrent') {
                        app.analytics.sendEvent("MainWindow", "Drop", "Torrent")
                        this.client.handleLaunchWithItem({entry:entry,
                                                          type:item.type})

                    } else {
                        app.analytics.sendEvent("MainWindow", "Drop", "Entry")
                        this.createNotification({details:"Sorry. Creating torrents is not yet supported."})
                    }
                    // cool, now I can call chrome.fileSystem.retainEntry ...
                } else {
                    //console.log('extracted entry as...',item.webkitGetAsEntry()) // returns null
                }
            }
        }
        var url = evt.dataTransfer.getData('text/uri-list')
        if (url) {
            this.client.app.add_from_url(url)
        }
    },
    suspend: function() {
        this.client.stop()
    },
    open_share_window: function() {
        var torrent = this.UI.get_selected_torrent()
        if (torrent) {
            window.open(torrent.getShareLink())
        }
    },
    toolbar_resetstate: function() {
        app.analytics.sendEvent("Toolbar", "Click", "ResetState")
        var torrents = this.UI.get_selected_torrents()
        for (var i=0; i<torrents.length; i++) {
            torrents[i].resetState()
        }
    },
    toolbar_recheck: function() {
        app.analytics.sendEvent("Toolbar", "Click", "Recheck")
        var torrents = this.UI.get_selected_torrents()
        for (var i=0; i<torrents.length; i++) {
            console.log('recheck',i)
            torrents[i].recheckData()
        }
    },
    toolbar_start: function() {
        if (! this.canDownload()) {
            this.notifyNoDownloadsLeft()
            return
        }
        app.analytics.sendEvent("Toolbar", "Click", "Start")
        var torrents = this.UI.get_selected_torrents()
        for (var i=0; i<torrents.length; i++) {
            torrents[i].start()
        }
    },
    toolbar_stop: function() {
        app.analytics.sendEvent("Toolbar", "Click", "Stop")
        var torrents = this.UI.get_selected_torrents()
        for (var i=0; i<torrents.length; i++) {
            torrents[i].stop({reason:'toolbar'})
        }
    },
    toolbar_remove: function() {
        app.analytics.sendEvent("Toolbar", "Click", "Remove")
        var torrents = this.UI.get_selected_torrents()
        var text = "";
        var selected = false;
        
        // First check if any torrents are selected
        if(torrents.length) {
            if(torrents.length == 1) {
                // Only 1 torrent selected, find out its name
                text = "Remove '" + torrents[0]._attributes.name + "'?";
            }
            else if(torrents.length > 1) {
                // Multiple torrents selected, don't use names
                text = "Remove " + torrents.length + " torrents?";
            }
            
            var holder = this;
            
            // jQuery confirm dialog
            $.confirm({
                text: text,
                confirm: function() {
                    // User clicked yes, remove the torrent(s)
                    holder.UI.torrenttable.grid.setSelectedRows([])
                    for (var i=0; i<torrents.length; i++) {
                        torrents[i].remove()
                    }
                },
                cancel: function() {
                    // User clicked cancel, do nothing
                }
            });
        }
    },
    openReviewPage: function() {
        this.setSyncAttribute('clicked_review',true)
        window.open(jstorrent.constants.cws_base_url +
                    chrome.runtime.id + '/reviews'
                    ,'_blank')
    },
    createPleaseReviewMeNotification: function() {
        if (this.sessionState['haderror']) {
            // dont want to encourage a review at this point in time :-)
            return
        }
        if (this.syncAppAttributes) {
            if (this.syncAppAttributes['clicked_review'] ||
                this.syncAppAttributes['dont_show_review']) {
                return
            }
        }

        this.createNotification({id:"pleaseReviewMe",
                                 priority:1,
                                 buttons: [
                                     {title:"Leave a Review", iconUrl:"/cws_32.png"},
                                     {title:"Don't show this message again"}
                                 ],
                                 onClick: _.bind(this.openReviewPage,this),
                                 onButtonClick: _.bind(function(idx) {
                                     console.log('button clicked',idx)
                                     if (idx == 0) {
                                         this.openReviewPage()
                                     } else {
                                         this.setSyncAttribute('dont_show_review',true)
                                     }
                                 },this),
                                 details:"Let other users know about your experience with JSTorrent!"})
    },
    select_torrent: function() {
        chrome.fileSystem.chooseEntry( {type: 'openFile',
                                        accepts: [
                                            {
                                                mimeTypes: ['application/x-bittorrent'],
                                                extensions: ['torrent']
                                            }
                                        ],
                                        acceptsAllTypes: false,
                                        acceptsMultiple: false },
                                       this.on_select_torrent.bind(this) )
    },
    on_select_torrent: function(result) {
        // XXX - sometimes not working???
        if (result) {
            var entry = result[0]
            this.client.addTorrentFromEntry(entry)
        }
    },
    add_from_url: function(url) {
        if (! this.canDownload()) {
            this.notifyNoDownloadsLeft()
            return
        }
        client.add_from_url(url)

        if (this.syncAppAttributes) {
            if (this.syncAppAttributes['dont_show_extension_help']) {
                // HOLY CRAP im an idiot
                return
            }
        }

        if (jstorrent.device.platform == 'Android') { return }
        // show notification for extension
        this.checkIsExtensionInstalled( _.bind(function(isInstalled) {
            if (! isInstalled) {
                this.createNotification({id:"extension",
                                         buttons: [
                                             {title:"Install the Extension", iconUrl:"/cws_32.png"},
                                             {title:"Don't show this message again"}
                                                  ],
                                         onButtonClick: _.bind(function(idx) {
                                             console.log('button clicked',idx)
                                             if (idx == 0) {
                                                 window.open(jstorrent.constants.cws_jstorrent_extension_url,'_blank')
                                             } else {
                                                 this.setSyncAttribute('dont_show_extension_help',true)
                                             }
                                         },this),
                                         details:"Did you know there is a browser extension that adds a Right Click (context) Menu to make adding torrents from the Web easier?"})

            }
        },this))
    },
    external_storage_attached: function(storageInfo) {
        console.log('external storage attached',storageInfo)
        setTimeout( function() {
            for (var i=0; i<this.client.disks.items.length; i++) {
                // check if new disk available
                var disk = this.client.disks.items[i]
                if (! disk.entry) {
                    disk.restoreFromKey()
                }
            }
        }.bind(this), 2000 ); // XXX bug it takes like some time after storage event before disk avail?
    },
    external_storage_detached: function(storageInfo) {
        console.log('external storage detached',storageInfo)
        // TODO -- maybe check disks and invalidate
    },
    focus_or_open_options: function() {
        if (this.options_window) {
            this.options_window.focus();
            console.log('options already open'); return;
        }

        this.options_window_opening = true
        chrome.app.window.create( 'gui/options.html',
                                  { width: 400,
                                    id: "options",
                                    height: 400 },
                                  _.bind(this.options_window_opened, this)
                                );
    },
    options_window_opened: function(optionsWindow) {
        this.stopPulsateOptions()
        app.analytics.sendAppView("OptionsView")
        this.options_window_opening = false
        this.options_window = optionsWindow
        optionsWindow.contentWindow.mainAppWindow = window;
        optionsWindow.onClosed.addListener( _.bind(this.options_window_closed, this) )
    },
    options_window_closed: function() {
        this.options_window = null
    },
    open_upsell_page: function() {
        if (this.upsell_window) {
            this.upsell_window.focus()
        }
        chrome.app.window.create( 'gui/upsell.html',
                                  { width: 520,
                                    id:"upsell",
                                    height: 480 },
                                  _.bind(this.upsell_window_opened, this)
                                );
    },
    upsell_window_opened: function(upsellWindow) {
        app.analytics.sendAppView("UpsellView")
        this.upsell_window = upsellWindow
        upsellWindow.contentWindow.mainAppWindow = window;
        upsellWindow.onClosed.addListener( _.bind(this.upsell_window_closed, this) )
    },
    upsell_window_closed: function() {
        this.upsell_window = null
    },
    addTracker: function(val) {
        var context = this.addCustomTrackerContext
        var torrent = context.collection.opts.torrent
        torrent.addTrackerByURL(val)
    },
    createWindowCustomTracker: function(item) {
        this.addCustomTrackerContext = item
        this.focus_or_open('addcustomtracker', null, {width:360, height:80})
    },
    focus_or_open: function(type, callback, opts) {
        if (this.popup_windows[type]) {
            this.popup_windows[type].focus()
            if (callback) {callback(this.popup_windows[type])}
        } else {
            var width = (opts && opts.width) || 520
            var height = (opts && opts.height) || 480
            var bounds = { width: width, height: height }
            // if use an ID, it saves the first opened height... strange
            chrome.app.window.create( 'gui/'+type+'.html',
                                      { bounds: bounds,
                                         },
                                      _.bind(this.window_opened, this, type, callback)
                                    );
        }
    },
    window_opened: function(type, callback, win) {
        this.popup_windows[type] = win
        win.contentWindow.mainAppWindow = window;
        if (callback) {callback(win)}
        win.onClosed.addListener( _.bind(this.window_closed, this, type) )
    },
    window_closed: function(type) {
        delete this.popup_windows[type]
    },
    focus_or_open_help: function() {
        if (this.help_window) {
            this.help_window.focus();
            console.log('help already open'); return;
        }

        this.help_window_opening = true
        chrome.app.window.create( 'gui/help.html',
                                  { width: 520,
                                    id:"help",
                                    height: 480 },
                                  _.bind(this.help_window_opened, this)
                                );
    },
    help_window_opened: function(helpWindow) {
        app.analytics.sendAppView("HelpView")
        this.help_window_opening = false
        this.help_window = helpWindow
        helpWindow.contentWindow.mainAppWindow = window;
        helpWindow.onClosed.addListener( _.bind(this.help_window_closed, this) )
    },
    help_window_closed: function() {
        this.help_window = null
    },
    set_default_download_location: function(entry) {
        if (! entry) {
            this.createNotification({details:"No download folder was selected."})
            return
        }

        // clear the other notifications
        var id = 'notifyneeddownload'
        if (this.notifications.get(id)) {
            chrome.notifications.clear(id,function(){})
        }

        //console.log("Set default download location to",entry)
        var s = jstorrent.getLocaleString(jstorrent.strings.NOTIFY_SET_DOWNLOAD_DIR, entry.name)
        this.createNotification({details:s, id:"notifyselected", priority:0})
        setTimeout(_.bind(function(){
            if (this.notifications.get("notifyselected")) {
                chrome.notifications.clear("notifyselected",function(){})
            }
        },this),2000)
        var disk = new jstorrent.Disk({entry:entry, parent: this.client.disks})
        this.client.disks.add(disk)
        this.client.disks.setAttribute('default',disk.get_key())
        this.client.disks.save()
    },
    notify: function(msg,prio) {
        if (prio === undefined) { prio = 0 }
        this.createNotification({details:msg, priority:prio})
        console.warn('notification:',msg);
    },
    initialize: function(callback) {
        this.options.load( _.bind(function() {
            this.on_options_loaded()
            this.initialize_client()
            this.client.on('ready', function() {
                callback()
            })
            if (jstorrent.options.load_options_on_start) { this.focus_or_open_options() }
        },this))
    }
}
