/*globals require*/
require.config({
    shim: {
        underscore: {
            exports: '_'
        }
    },
    paths: {
        famous: '../lib/famous',
        requirejs: '../lib/requirejs/require',
        almond: '../lib/almond/almond',
        'famous-polyfills': '../lib/famous-polyfills/index',
        bootstrap: '../lib/bootstrap/dist/js/bootstrap',
        underscore: '../lib/underscore/underscore'
    }
});
require(['underscore', 'main']);
