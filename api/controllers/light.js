'use strict';

module.exports.setLightState = (req, res) => {

    let id = req.swagger.params.id.value;
    let state = req.swagger.params.state.value;

    let item = id.replace(/:/g, '_');

    if ( !item.includes('_switch_binary'))
        item += '_switch_binary';

    global.module.setState(item, state === 'on' ? 'ON' : 'OFF')
        .then( (status) => {
            res.json( { data: { status: status }, result : 'ok' } );
        })
        .catch( (err) => {
            if ( err.code === 404 ){
                item = item.replace('_switch_binary', '_switch_dimmer');
                global.module.setState(item, ( state === 'on' ? '100' : '0') )
                    .then( (status) => {
                        res.json( { data: { status: status }, result : 'ok' } );
                    })
                    .catch( (err) => {
                        res.status(err.code >= 400 && err.code <= 451 ? err.code : 500).json( { code: err.code || 0, message: err.message } );
                    });
                return;
            }
            res.status(err.code >= 400 && err.code <= 451 ? err.code : 500).json( { code: err.code || 0, message: err.message } );
        });
};

module.exports.setLightLevel = (req, res) => {

    let id = req.swagger.params.id.value;
    let value = req.swagger.params.level.value;

    let item = id.replace(/:/g, '_');

    if ( !item.includes('_switch_dimmer'))
        item += '_switch_dimmer';

    global.module.setState(item, value)
        .then( (status) => {
            res.json( { data: { status: status }, result : 'ok' } );
        })
        .catch( (err) => {
            res.status(err.code >= 400 && err.code <= 451 ? err.code : 500).json( { code: err.code || 0, message: err.message } );
        });
};
