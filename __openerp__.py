
{
    'name': 'Web Full Calendar',
    'description': """
OpenERP Web Calendar view.
==========================

""",
    'version': '0.1',
    ## depends on web_calendar to properly ensure that it's loaded AFTER
    'depends': ['web', 'web_calendar'],
    'js': [
        'static/lib/fullcalendar/js/fullcalendar.js',
        'static/lib/fullcalendar/js/gcal.js',
        'static/src/js/*.js'
    ],
    'css': [
        'static/lib/fullcalendar/css/*.css',
        'static/src/css/*.css'
    ],
    'qweb': [
        'static/src/xml/*.xml',
    ],
}
