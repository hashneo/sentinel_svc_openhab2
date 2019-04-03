'use strict';

module.exports.setLockState = (req, res) => {

    let id = req.swagger.params.id.value;
    let state = req.swagger.params.state.value;

    let item = id.replace(/:/g, '_');

    global.module.setState(item, state === 'open' ? 'ON' : 'OFF')
        .then( (status) => {
            res.json( { data: { status: status }, result : 'ok' } );
        })
        .catch( (err) => {
            res.status(500).json({code: err.code || 0, message: err.message});
        });
};

