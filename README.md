# JSTorrent (Legacy Chrome App)

> **This project is retired.** Chrome Apps have been deprecated by Google and are no longer supported.
>
> **The current JSTorrent is available at [jstorrent.com](https://jstorrent.com)**,
> with a first-party Rust engine for desktop, Android and supported ChromeOS
> configurations.
>
> Current source: **[github.com/kzahel/rstorrent](https://github.com/kzahel/rstorrent)**.
> The intervening TypeScript implementation is retained at
> [github.com/kzahel/jstorrent](https://github.com/kzahel/jstorrent).

---

JSTorrent was the original Chrome Packaged/Platform App for downloading
torrents. It stands for "JavaScript Torrent." It is perfect for cheap
ARM Chromebooks when you need to torrent something, but also perfect
for your high end Chromebook Pixel. :-) While it is specifically designed
to integrate well with ChromeOS, it will also run on Windows / Mac /
Linux, or anywhere else you are able to install Google Chrome.

JSTorrent is the world's most secure Torrent client. It runs in the
Chrome sandbox, so it does not have access to any files on your system
(except the Download folder you choose). With JSTorrent, you are in
control.

I don't frequently keep this readme very up to date. You can find the
actual changelogs in the [Chrome Web Store listing](https://chrome.google.com/webstore/detail/jstorrent/anhdpjpojoipgpmfanmedjghaligalgb), or sometimes in the [CHANGES.txt](CHANGES.txt)

One of my main goals with this project is to get it nearly as fast as
the other clients. Disk I/O is pretty slow with the chrome APIs, which I am working on optimizing for.
Some other bottlenecks at this point include SHA1 hashing (done in a worker)
as well as suboptimal peer selection and queueing.

I am frequently adding features and improvements to this project, and
welcome user feedback, as it directs the future growth of the program.

This software was totally rewritten from scratch (Dec 2013). This is
about the third time I've written a torrent client, so it should be
the least buggy of them all :-)

I'm currently charging $3 for the install on the chrome web store. But
you can also run it from source here. I want to do some kind of
donate/freemium model, once I can figure out this:
http://stackoverflow.com/questions/21147236/get-user-openid-url-without-user-interaction
(I want to be able to detect users who already paid $3)

The source code is available here for auditing and education
purposes. I believe open software is great, and I would not ask any
user to install something that they can't reasonably verify is not
doing anything malicious. However, the license does not permit
redistribution of the jstorrent code or assets in your own projects.

## Installation:

Most people would usually install by the Chrome Web Store ([link](https://chrome.google.com/webstore/detail/jstorrent/anhdpjpojoipgpmfanmedjghaligalgb)) but you can install from 
source too.
* Click the "Download ZIP" button near the top of the page.***
* Unzip it.
* Visit "chrome://extensions"
* Click the checkbox "Developer Mode" on the top
* Click "Load unpacked extension"
* Browse to the unzipped file then press "Open"
* You're done! (Note that you will not get updates this way, you will need to manually update)
* NOTE***: This project now uses a submodule "web-server-chrome" (https://github.com/kzahel/web-server-chrome) so you probably have to download that project separately and put it in the "js" folder. (you may need to rename folder from "web-server-chrome-master" to "web-server-chrome")

## Websites:

- https://www.jstorrent.com

- https://www.reddit.com/r/jstorrent (on Reddit)

- https://twitter.com/jstorrent (Twitter Page)

## Special New Features

- Support downloading directly to directory of choice
  - download to external media (usb drives)
  - Per-torrent download directories
  - multiple download directories
  - skip downloading files
- Unlimited size downloads (multi gigabyte torrents)

### Private tracker support notes for site admins

Private tracker support is very lacking. I don't know of any sites
that have whitelisted/allowed JSTorrent. I am working on addressing
this by improving the seeding and tracker funcions.

- The "User-Agent" header looks like: (JSTorrent/{version}) (current x-user-agent string version: "JSTorrent/2480") for version 2.4.8
- The peer id begins with "-JS{version}-", currently peer id begins with "-JS2480-"

I have disabled the "spoofing" feature.

### Todo
- see [TODO.txt](https://github.com/kzahel/jstorrent/blob/fresh/TODO.txt)
- too many things
- figure out chrome.fileSystem getting in broken state bugs (persistently problematic)
- smarter disk cache
- better seeding disk access / read entire piece at a time
- implement i18n
- pNaCL sha1 hashing benchmark vs native JS vs window.crypto
- use chrome.identity and GCM for remote control (pushMessaging) (in progress)
- DHT
- uPNP+bind/listen TCP - (in progress)
- SOCKS5 proxy support
- headless operation (in progress)

### Credits

- JSTorrent Logo - Michael Cook
- Users and supporters that produce good bug reports :-)
