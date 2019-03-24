'use strict';

module.exports.process = (_data, _state) => {

    switch (_state.variable) {
        case  'ArmMode':
            _data['armed'] = (_state.value === 'Armed');
            break;
    }

    return _data;
};