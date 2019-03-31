'use strict';

module.exports.setLightState = (req, res) => {

    let id = req.swagger.params.id.value;
    let state = req.swagger.params.state.value;

    let item = id.replace(/:/g, '_') + '_switch_binary';

    global.module.setState(item, state === 'on' ? 'ON' : 'OFF')
        .then( (status) => {
            res.json( { data: { status: status }, result : 'ok' } );
        })
        .catch( (err) => {
            res.status(500).json({code: err.code || 0, message: err.message});
        });
};

module.exports.setLightLevel = (req, res) => {

    let id = req.swagger.params.id.value;
    let value = req.swagger.params.level.value;

    let item = id.replace(/:/g, '_') + '_switch_dimmer';

    global.module.setState(item, value)
        .then( (status) => {
            res.json( { data: { status: status }, result : 'ok' } );
        })
        .catch( (err) => {
            res.status(500).json( { code: err.code || 0, message: err.message } );
        });
};
