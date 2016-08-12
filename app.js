var express                 = require('express'),
    request                 = require('request'),
    _                       = require('lodash');

var config                  = require('./config/config.js').config,
    logger                  = require('./lib/logger'),
    package_json            = require('./package.json');

var bodyParser = require('body-parser');
var slack_token =  process.env.SLACK_TOKEN || null;
var slack_api_token =  process.env.SLACK_API_TOKEN || null;


logger.debug('SLACK_TOKEN', slack_token);
var app = express();
app.use(bodyParser.json());
app.set('config', config);
app.set('package_json', package_json);
app.set('port', process.env.PORT  || 8081);
// app.set('hostname', config.server.hostname || '0.0.0.0');
app.set('slack_token', slack_token);
app.set('slack_api_token', slack_api_token);

var love = []; // Temp in memory

// Routes
app.get('*', function (req, res, next){ // Log all requests
    var app = req.app;
    var logline = ['method=' + req.method, 'path=' + req.path, 'ip=' + req.ip];
    logger.info(logline.join(' '));
    next();
});

// Authenticate all posts and extract params
app.post('*', function (req, res, next){
    var vals = {};
    if (req.body.params) {
        req.body.params.forEach(function(param){
            vals[param['name']] = param['value'];
        });
        if (vals.token !== app.get('slack_token')) {
            return res.sendStatus(401);
        } else {
            req.slack_params = vals;
            next();
        }
    }
});

app.get("/ping", handle_ping);
app.post("/love", handle_love);
app.get("/recentlove", handle_recentlove);

// Handlers
function handle_ping(req, res){
    var app = req.app;

    var ping_data = {
        "status"        : "OK",
        "name"          : app.get('package_json').name,
        "version"       : app.get('package_json').version,
        "pid"           : "_" + process.pid
    };
    res.status(200).send(ping_data);
}

function handle_love(req, res){

    var fields = [
        'user_id',
        'user_name',
        'text',
        'team_domain',
    ];

    // get the @user from the beginning of message
    re = /^\@(\w+)/;
    matches = req.slack_params.text.match(re);
    if (matches && matches[1]) {
        var slack_user_names = Object.keys(app.get('slack_users')) || [],
            recipient_user_name = matches[1];
        if (! _.includes(slack_user_names, recipient_user_name)) {
            // TODO inject message back to slack channel
            return res.sendStatus(404);
        }
    }
    var message = {}
    fields.forEach(function(field){
        message[field] = req.slack_params[field];
    })
    if (message) {
        logger.info("***LOVE", message);
        love.push(message);
    }
    return res.sendStatus(200);
}

function handle_recentlove(req, res){
    // TODO: Need to insert into chat
    return res.json(love);
}

// Refresh slack user list for verification
function get_slack_user_list() {
    var url = 'https://slack.com/api/users.list?token=' + app.get('slack_api_token');
    request.get(url, function(err, res, body){
        if (err) {
            logger.error('get_slack_user_list', err);
        } else {
            var slack_users = {},
                parsed_body = JSON.parse(body);
            parsed_body.members.forEach(function(member){
                slack_users[member.name] = {
                    real_name: member.real_name
                }
            })
            app.set('slack_users', slack_users);
            logger.info('slack_users', slack_users);
        }
    })
}

get_slack_user_list()
setInterval(function() {
    get_slack_user_list();
}, 60 * 1000);

// Start server

var server = app.listen(app.get('port'), app.get('hostname'), function() {
    logger.info('Server listening on http://' + app.get('hostname') + ':' + app.get('port'));
});
