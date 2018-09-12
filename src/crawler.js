import async from 'async';
import request from 'request';
import url from 'url';
import fs from 'fs';
import robotsParser from 'robots-txt-parser';

var robots = robotsParser({
    userAgent: 'Googlebot',
    allowOnNeutral: false 
})
  
export default class Crawler {
    
    startTime = null
    startUrl = null
    outputFile = null
    asyncLimit = 30
    depthLimit = 3
    restTime = 100
    timeout = 5000
    debug = false
    linkQueue = []
    hosts = {}
    isRunning = true
    
    counter = {
        hosts: 0,
        paths: 0
    }
    
    static errors = {
        NOCRAWL: 'Denied by robots.txt'
    }
    
    get runTime() {
        return Math.floor((Date.now() / 1000) - this.startTime)
    }
    
    get timeLimit() {
        return this._timeLimit
    }
    
    set timeLimit(minutes) {
        this._timeLimit = minutes * 1000 * 60
    }
  
    constructor(startUrl) {
        this.startUrl = startUrl
    }
    
    start() {
        this.startTime = Date.now() / 1000
        this.addToQueue(this.startUrl)
        this._startBatchLoop()
        
        if (this.timeLimit) {
            setTimeout(this.stop.bind(this), this.timeLimit)
        }
    }
    
    stop() {
        this._dprint('Ran for:', this.runTime, "seconds")
        this.isRunning = false
        
        if (this.outputFile) {
            Crawler.outputResults(this.outputFile, this.hosts)
        }
        
        this.onComplete(this.hosts)
    }
    
    onComplete() {
        this._dprint('Completed search but no callback found.')
    }
    
    addToQueue(uri) {
        let link = Crawler.parseUrl(uri)
        
        if (!this.hosts.hasOwnProperty(link.host)) {
            this.counter.hosts++
            this.hosts[link.host] = {
                protocol: link.protocol,
                depthCount: 0,
                crawledPaths: []
            }
        }

        if (this.hosts[link.host].depthCount < this.depthLimit &&
            this.hosts[link.host].crawledPaths.indexOf(link.path) === -1) {
            this.linkQueue.push(link)
            this.hosts[link.host].depthCount++
            this.counter.paths++
        }
    }
    
    _startBatchLoop() {
        let batchStartTime = Date.now()
        
        let batchComplete = () => {
            let runTime = Math.floor(Date.now() - batchStartTime)
            this._dprint('Hosts:', this.counter.hosts, 'Paths:', this.counter.paths, 'Queue:', this.linkQueue.length, 'Took', runTime + 'ms')
            
            if (this.isRunning && this.linkQueue.length > 0) {
                batchStartTime = Date.now()
                setTimeout(this._processBatch.bind(this, batchComplete), this.restTime)
            }
        }
        
        this._processBatch(batchComplete)
    }
    
    _processBatch(callback) {
        let batch = this._getUsableBatch()
        
        async.eachLimit(batch, this.asyncLimit, async (link) => {
            await robots.useRobotsFor(link.protocol + '//' + link.host)
                .then(Crawler.fetchPageLinks.bind(this, link, this.timeout))
                .then(this._queuePageLinks.bind(this))
                .catch((reason) => {
                    this.dprint('Error with link:', link.full, 'Reason:', reason)
                })
        }, callback)
    }
    
    _queuePageLinks(links) {
        return new Promise((resolve, reject) => {
            if (links) {
                links.map((link) => {
                    this.addToQueue(link)
                })
            }
            
            resolve()
        })
    }
    
    _getUsableBatch() {
        if (this.linkQueue.length >= this.asyncLimit) {
            var queue = this.linkQueue.slice(0, this.asyncLimit)
            this.linkQueue = this.linkQueue.slice(this.asyncLimit)
        } else {
            var queue = this.linkQueue
            this.linkQueue = []
        }
        
        queue.map((value, index) => {
            if (this.hosts[value.host].crawledPaths.indexOf(value.path) === -1) {
                this.hosts[value.host].crawledPaths.push(value.path)
            }
        })
        
        return queue
    }
    
    _dprint() {
        if (this.debug == true) {
            console.log(Array.prototype.slice.call(arguments));
        }
    }
    
    static fetchPageLinks(uri, timeout) {
        return new Promise((resolve, reject) => {
            if (!robots.canCrawlSync(uri.full)) {
                return reject(Crawler.errors.NOCRAWL)
            }
            
            request({ uri: uri.full, timeout: timeout }, (error, response, body) => {
                if (error) {
                    return reject(error)
                }
                
                let links = Crawler.pullLinks(body)
                
                resolve(links)
            });
        })
    }
    
    static outputResults(file, hosts) {
        fs.writeFileSync(file, JSON.stringify(hosts))
    }
    
    static pullLinks(body) {
        return body.match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);
    }
    
    static parseUrl(uri) {
        var link = url.parse(uri)
        
        if (link.host.slice(0, 4) == 'www.') {
            link.host = link.host.substr(4)
        }
        
        var path = (link.pathname || '') + (link.search || '') + (link.hash || '')
        
        return {
            protocol: link.protocol,
            path: path,
            host: link.host,
            full: `${link.protocol}//${link.host}${path}`
        }
    }
}