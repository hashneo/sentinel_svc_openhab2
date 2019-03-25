'use strict';
require('array.prototype.find');

function _module(config) {

    if ( !(this instanceof _module) ){
        return new _module(config);
    }

    const logger = require('sentinel-common').logger;

    const redis = require('redis');
    const webSocketClient = require('websocket').client;

    var moment = require('moment');
    const uuid = require('uuid');

    let pub = redis.createClient(
        {
            host: process.env.REDIS || global.config.redis || '127.0.0.1' ,
            socket_keepalive: true,
            retry_unfulfilled_commands: true
        }
    );

    pub.on('end', function(e){
        logger.error('Redis hung up, committing suicide');
        process.exit(1);
    });

    var NodeCache = require( "node-cache" );

    const EventSource = require('eventsource');

    var deviceCache = new NodeCache();
    var statusCache = new NodeCache();

    var merge = require('deepmerge');

    var request = require('request');
    var http = require('http');
    var keepAliveAgent = new http.Agent({ keepAlive: true });
/*
    require('request').debug = true
    require('request-debug')(request);
*/

    const categories = require('./device_categories.json');

    deviceCache.on( 'set', function( key, value ){
        let data = JSON.stringify( { module: global.moduleName, id : key, value : value });
        logger.info( 'sentinel.device.insert => ' + data );
        pub.publish( 'sentinel.device.insert', data);
    });

    deviceCache.on( 'delete', function( key ){
        let data = JSON.stringify( { module: global.moduleName, id : key });
        logger.trace( 'sentinel.device.delete => ' + data );
        pub.publish( 'sentinel.device.delete', data);
    });

    statusCache.on( 'set', function( key, value ){
        let data = JSON.stringify( { module: global.moduleName, id : key, value : value });
        logger.trace( 'sentinel.device.update => ' + data );
        pub.publish( 'sentinel.device.update', data);
    });

	var that = this;

    function call(url) {

        return new Promise( (fulfill, reject) => {

            logger.trace(url);

            if ( url.startsWith('/') ){
                url = url.substring(1);
            }

            let options = {
                url : config.server + '/rest/' + url,
                headers : {
                    'Accept': 'application/json'
                },
                timeout : 90000,
                agent: keepAliveAgent
            };

            try {
                request(options, (err, response, body) => {
                    if (!err && response.statusCode == 200) {
                        fulfill(JSON.parse(body));
                    } else {
                        logger.error(err||body);
                        reject(err||body);
                    }
                });
            }catch(e){
                logger.error(err);
                reject(e);
            }
        } );
    }

    this.setState = ( id, value ) => {
        return new Promise( (fulfill, reject) => {

            let options = {
                url : config.server + '/rest/items/' + id,
                method: 'POST',
                headers : {
                    'Content-Type': 'text/plain'
                },
                body: value,
                timeout : 90000,
                agent: keepAliveAgent
            };

            logger.trace(options.url);

            try {
                request(options, (err, response, body) => {
                    if (!err && response.statusCode == 200) {
                        fulfill({});
                    } else {
                        logger.error(err||body);
                        reject(err||body);
                    }
                });
            }catch(e){
                logger.error(err);
                reject(e);
            }
        });
    };

    this.getDevices = () => {

        return new Promise( (fulfill, reject) => {
            deviceCache.keys( ( err, ids ) => {
                if (err)
                    return reject(err);

                deviceCache.mget( ids, (err,values) =>{
                    if (err)
                        return reject(err);

                    statusCache.mget( ids, (err, statuses) => {
                        if (err)
                            return reject(err);

                        let data = [];

                        for (let key in values) {
                            let v = values[key];

                            if ( statuses[key] ) {
                                v.current = statuses[key];
                                data.push(v);
                            }
                        }

                        fulfill(data);
                    });

                });
            });
        });
    };

    this.getDeviceStatus = (id) => {

        return new Promise( (fulfill, reject) => {
            try {
                statusCache.get(id, (err, value) => {
                    if (err)
                        return reject(err);

                    fulfill(value);
                }, true);
            }catch(err){
                reject(err);
            }
        });

    };

    function updateStatus() {
        return new Promise( ( fulfill, reject ) => {
            fulfill();
        });
    }

    this.Reload = () => {
        return new Promise( (fulfill,reject) => {
            fulfill([]);
        });
    };

    function getValue( state, type ){

        try {
            switch (type) {
                case 'Number':
                case 'Dimmer':
                case 'Percent':
                    return Number.parseInt(state);
                case 'Decimal':
                    return Number.parseFloat(state);
                case 'Switch':
                case 'OnOff':
                    return (state === 'ON');
            }
        }
        catch(e){
            logger.error(e);
        }
        return state;
    }

    function getItemValue( map, v, id, label, state, type ){

        if (!map[id])
            map[id] = {};

        if (!map[id][v[3]])
            map[id][v[3]] = {};

        let p = map[id][v[3]];

        if (v[4] !== undefined ){
            map[id][v[3]][v[4]] = {};
            p = map[id][v[3]][v[4]];
        }

        if (v[5] !== '' ){
            map[id][v[3]][v[4]][v[5]] = {};
            p = map[id][v[3]][v[4]][v[5]];
        }

        if ( label )
        p['label'] = label;
        p['value'] = getValue( state, type );

        return map;
    }


    function openMessageChannel(){

        return new Promise( (fulfill, reject) => {

            let url = config.server + '/rest/events';
/*
            var eventSourceInitDict = {headers: {'Authorization': authUser.token}};

            eventSourceInitDict.headers['Cookie'] = jar.getCookieString(url);
*/
            let es = new EventSource(url);

            es.addEventListener('open', function (e) {
                fulfill(es);
            });

            es.addEventListener('error', function (err) {
                reject(err);
            });

            es.addEventListener('message', function (e) {

                let data = JSON.parse(e.data);

                let v;

                if ( ( v = data.topic.match(/^smarthome\/items\/zw_device_(\w+)_(\w+)(?:_(\w+)_([a-z]+)(\d*))\/state$/) ) !== null ){
                    // zwave:device:dcb8fe2c:node14

                    let id = `zwave:device:${v[1]}:${v[2]}`;

                    let payLoad = JSON.parse( JSON.parse(e.data).payload );

                    let map = getItemValue( {}, v, id, null, payLoad.value, payLoad.type );

                    deviceCache.get(id, (err, device) => {

                        if (err || !device)
                            return;

                        let update = processItemData( device.type, map[id] );

                        statusCache.get(id, (err, current) => {
                            if (err)
                                return;


                            if (current !== undefined) {
                                let newVal = merge(current, update);

                                if (JSON.stringify(current) !== JSON.stringify(newVal)) {
                                    statusCache.set(id, newVal);
                                }
                            }

                        }, true);

                    });
                    logger.trace(e.data);
                }

            });

        });
    }

    function mapType( t ){
        switch ( t ){
            case 'GENERIC_TYPE_SWITCH_BINARY':
                return 'switch';
            case 'GENERIC_TYPE_SWITCH_MULTILEVEL':
                return 'light.dimmable';
                /*
                return 'alarm.panel';
                return 'alarm.partition';
                return 'garage.opener';
                return 'heater.floor';
                return 'hvac';
                return 'ip.camera';
                return 'ip.camera.hub';
                return 'ir.transmitter';

                return 'light.switch';
                return 'lock';
                return 'power.generator.solar';
                return 'power.meter';
                return 'sensor.co2';
                return 'sensor.door';
                return 'sensor.glass';
                return 'sensor.heat';
                return 'sensor.humidity';
                return 'sensor.leak';
                return 'sensor.motion';
                return 'sensor.smoke';
                return 'sensor.tamper';
                return 'sensor.temperature';
                return 'sensor.wind';
                return 'sensor.window';

                return 'system.timer';
                */
        }

        return null;
    }

    function processItemData( type, item ) {
        let v = {};

        switch (type) {
            case 'light.dimmable':
                if (item.switch && item.switch.dimmer)
                    v['level'] = item.switch.dimmer.value;
            case 'switch':
                if (item.switch && item.switch.binary)
                    v['on'] = item.switch.binary.value;
                break;
        }

        return v;
    }

    function loadSystem(){
        return new Promise( ( fulfill, reject ) => {
            call('things')

                .then((results) => {

                    if (results === undefined) {
                        reject('no data returned');
                    }

                    let devices = [];

                    for (let i in results) {
                        let device = results[i];

                        let type = mapType(device.properties.zwave_class_generic);

                        if (type) {
                            let d = {
                                id: device.UID,
                                name: device.label,
                                type: type,
                                current: {}
                            };

                            logger.trace(JSON.stringify(d));
                            deviceCache.set(d.id, d);
                            devices.push(d);
                        }
                    }

                    call( 'items')
                        .then( (items) => {

                            let map = {};
                            items.forEach( (device) => {
                                let v;

                                if ((v = device.name.match(/^zw_device_(\w+)_(\w+)(?:_(\w+)_([a-z]+)(\d*))/)) !== null) {
                                    let id = `zwave:device:${v[1]}:${v[2]}`;

                                    //let k = v[3];

                                    getItemValue(map, v, id, device.label, device.state, device.type );
                                }
                            });

                            devices.forEach ( (device) =>{

                                if ( map[device.id] ){

                                    let item = map[device.id];

                                    let v =  processItemData( device.type, item );

                                    if (v)
                                        statusCache.set(device.id, v);
                                }
                            });

                            fulfill(devices);
                        })
                        .catch((err) => {
                            reject(err);
                        });

                    logger.info(`System load complete.`);

                })
                .catch((err) => {
                    reject(err);
                })
        });
    }

    loadSystem()
        .then( () => {
            return openMessageChannel();
        })
        .catch((err) => {
            logger.error(err);
            process.exit(1);
        });

    return this;
}

module.exports = _module;