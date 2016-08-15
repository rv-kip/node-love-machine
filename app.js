var bodyParser              = require('body-parser'),
    express                 = require('express'),
    request                 = require('request'),
    _                       = require('lodash');

var logger                  = require('./lib/logger'),
    package_json            = require('./package.json');

var slack_token =  process.env.SLACK_TOKEN || null,
    slack_api_token = process.env.SLACK_API_TOKEN || null,
    heroku_host = process.env.HEROKU_HOST;

logger.debug('SLACK_TOKEN', slack_token);

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.set('package_json', package_json);
app.set('port', process.env.PORT  || 8081);
app.set('hostname', process.env.HOST || '0.0.0.0');
app.set('slack_token', slack_token);
app.set('slack_api_token', slack_api_token);
app.set('heroku_host', heroku_host);

var love = []; // Temp in memory

// Log all requests
app.get('*', function (req, res, next){ // Log all requests
    var app = req.app;
    var logline = ['method=' + req.method, 'path=' + req.path, 'ip=' + req.ip];
    logger.info(logline.join(' '));
    next();
});

// Authenticate all posts as coming from slack
app.post('*', function (req, res, next){
    logger.info(req.body);
    if (req.body && req.body['token'] === app.get('slack_token')) {
        return next();
    } else {
        return res.status(401).send("Sorry. Your Slack credentials are invalid.");
    }
});

// Routes
app.get('/:love_id', handle_love_link);
app.get('/ping', handle_ping);
app.post('/love', handle_love);
app.get('/recentlove', handle_recentlove);

// Handlers
function handle_ping(req, res){
    var app = req.app,
        ping_data = {
            'status'        : 'OK',
            'name'          : app.get('package_json').name,
            'version'       : app.get('package_json').version,
            'pid'           : '_' + process.pid
        };

    res.status(200).send(ping_data);
}

function handle_love_link(req, res){
    var love_id = req.params.love_id,
        message = love[love_id];

    return res.status(200).send(message);
}

function handle_love(req, res){
    // TODO: this is just a hack for a demo
    if (_.includes(req.body.text,'recent love')) {
        return handle_recentlove(req, res);
    }

    // get the @user from the beginning of message
    re = /^\@(\w+)\s+(.+)$/;
    matches = req.body.text.match(re);
    var recipient_user_name,
        love_message,
        slack_user_names;
    if (matches && matches[1]) {
        slack_user_names = Object.keys(app.get('slack_users')) || [];
        recipient_user_name = matches[1];
        love_message = matches[2];

        if (! _.includes(slack_user_names, recipient_user_name)) {
            // TODO inject message back to slack channel
            return res.status(404).send('Sorry, the user "' + recipient_user_name + '" is not valid.');
        }
    }
    var message = {},
        love_id,
        fields = [
            'user_id',
            'user_name',
            'text',
            'team_domain',
        ];
    fields.forEach(function(field){
        message[field] = req.body[field];
    });
    if (message) {
        logger.info('love sent', message);
        love.push(message);
        love_id = love.length - 1;
        link = app.get('heroku_host') + love_id;
    }

    // send message back to chat
    var text = req.body.user_name + ' sent love to ' + recipient_user_name;
    text += ' for "' + love_message + '"!\n(' + link + ')';
    request({
        url: req.body.response_url,
        method: 'POST',
        json: {
            text: text
        }
    }, function(err){
        if (err){
            logger.error(err);
        }
    });

    // TODO: pull from a variety of phrases
    return res.status(200).send('Love has been sent');
}

function handle_recentlove(req, res){
    // TODO: Need to insert into chat
    var retval = ['*Recent Love*:'];
    love.forEach(function (love_item){
        retval.push(love_item.user_name + ': ' + love_item.text);
    });

    return res.send(retval.join("\n"));
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
}, 60 * 60 * 1000);

// Start server

var server = app.listen(app.get('port'), app.get('hostname'), function() {
    logger.info('Server listening on http://' + app.get('hostname') + ':' + app.get('port'));
});
