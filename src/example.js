import Crawler from './crawler';

var crawler = new Crawler('http://bbc.com')

crawler.debug = true
crawler.timeLimit = 1
crawler.depth = 3
crawler.asyncLimit = 10
crawler.outputFile = 'output.json'

crawler.onComplete = function(hosts) {
    console.log('Finished callback called')
}

crawler.start()