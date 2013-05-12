/*globals: openerp,$ */

/*---------------------------------------------------------
 * OpenERP web_calendar
 *---------------------------------------------------------*/

openerp.web_fullcalendar = function(instance) {

    var _t = instance.web._t,
        _lt = instance.web._lt;
    var QWeb = instance.web.qweb;

    var defaultOptions = {

        /*
         * Internationalization
         */

        // Dates

        monthNames: Date.CultureInfo.monthNames,
        monthNamesShort: Date.CultureInfo.abbreviatedMonthNames,
        dayNames: Date.CultureInfo.dayNames,
        dayNamesShort: Date.CultureInfo.abbreviatedDayNames,

        // Label

        weekNumberTitle: _t("W"),
        allDayText: _t("all-day"),

        // Functional

        firstDay: Date.CultureInfo.firstDayOfWeek,

        /* XXXvlab: propose a patch to formatDate
           https://github.com/arshaw/fullcalendar/blob/0c20380d6967e6669633918c16047bc23eae50f2/src/date_util.js
           So as to allow overriding of formatDate function only (and not formatDates), and
           use datejs formatting codes.
        */
        // columnFormat: {
        //     month: ,
        //     week: ,
        //     day: ,
        // }

    };

    instance.web.views.add('calendar', 'instance.web_fullcalendar.FullCalendarView');

    instance.web_fullcalendar.FullCalendarView = instance.web.View.extend({
        template: "FullCalendarView",
        display_name: _lt('Calendar'),

        init: function (parent, dataset, view_id, options) {
            this._super(parent);
            this.ready = $.Deferred();
            this.set_default_options(options);
            this.dataset = dataset;
            this.model = dataset.model;
            this.fields_view = {};
            this.view_id = view_id;
            this.view_type = 'calendar';


            this.COLOR_PALETTE = ['#f57900', '#cc0000', '#d400a8', '#75507b', '#3465a4', '#73d216', '#c17d11', '#edd400',
                                  '#fcaf3e', '#ef2929', '#ff00c9', '#ad7fa8', '#729fcf', '#8ae234', '#e9b96e', '#fce94f',
                                  '#ff8e00', '#ff0000', '#b0008c', '#9000ff', '#0078ff', '#00ff00', '#e6ff00', '#ffff00',
                                  '#905000', '#9b0000', '#840067', '#510090', '#0000c9', '#009b00', '#9abe00', '#ffc900' ];

            this.color_map = {};
            this.last_search = [];
            this.range_start = null;
            this.range_stop = null;
            this.selected_filters = [];
        },

        view_loading: function (data) {
            this.fields_view = data;
            this.$el.addClass(this.fields_view.arch.attrs['class']);
            this.$calendar = this.$el; // .find(".oe_calendar");

            this.calendar_fields = {};
            this.ids = this.dataset.ids;
            this.color_values = [];
            this.info_fields = [];

            /* xml view calendar options */

            this.name = this.fields_view.name || this.fields_view.arch.attrs.string;
            this.view_id = this.fields_view.view_id;

            // mode, one of month, week or day
            this.mode = this.fields_view.arch.attrs.mode;

            // date_start is mandatory, date_delay and date_stop are optional
            this.date_start = this.fields_view.arch.attrs.date_start; // Field name of starting date field
            this.date_delay = this.fields_view.arch.attrs.date_delay;
            this.date_stop = this.fields_view.arch.attrs.date_stop;
            this.all_day = this.fields_view.arch.attrs.all_day;

            this.day_length = this.fields_view.arch.attrs.day_length || 8;
            this.color_field = this.fields_view.arch.attrs.color;
            this.color_string = this.fields_view.fields[this.color_field] ?
                this.fields_view.fields[this.color_field].string : _t("Filter");


            if (this.color_field && this.selected_filters.length === 0) {
                var default_filter;
                if ((default_filter = this.dataset.context['calendar_default_' + this.color_field])) {
                    this.selected_filters.push(default_filter + '');
                }
            }
            this.fields =  this.fields_view.fields;

            if (!this.date_start) {
                throw new Error(_t("Calendar view has not defined 'date_start' attribute."));
            }

            /* Calendar Fields */

            this.calendar_fields.date_start = {'name': this.date_start, 'kind': this.fields[this.date_start].type};

            if (this.date_delay) {
                if (this.fields[this.date_delay].type != 'float') {
                    throw new Error(_t("Calendar view has a 'date_delay' type != float"));
                }
                this.calendar_fields.date_delay = {'name': this.date_delay, 'kind': this.fields[this.date_delay].type};
            }
            if (this.date_stop) {
                this.calendar_fields.date_stop = {'name': this.date_stop, 'kind': this.fields[this.date_stop].type};
            }

            for (var fld = 0; fld < this.fields_view.arch.children.length; fld++) {
                this.info_fields.push(this.fields_view.arch.children[fld].attrs.name);
            }

            this.init_fullcalendar();

            // XXXvlab: not very reliable as there are serious bugs in OpenERP sides.
            // this.dataset.on('dataset_changed', this, function (id) {
            //     this.reload_event_by_id(id);
            // });
            this.trigger('calendar_view_loaded', data);
            return this.ready.resolve();
        },

        init_fullcalendar: function() {
            var self = this;

            this.$calendar.fullCalendar($.extend({

                header: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay'
                },
                selectable: true,
                selectHelper: true,
                editable: true,

                // callbacks

                eventDrop: function (event, _day_delta, _minute_delta, _all_day, _revertFunc) {
                    self.proxy('quick_save')(event); // we don't revert the event, but update it.
                },
                eventResize: function (event, _day_delta, _minute_delta, _revertFunc) {
                    self.proxy('quick_save')(event);
                },
                eventClick: function (event) { self.open_event(event._id); },
                select: function (start_date, end_date, all_day, _js_event, _view) {
                    var title = prompt('Event Title:');
                    if (title) {
                        self.quick_create({
                            title: title,
                            start: start_date,
                            end: end_date,
                            allDay: all_day,
                        });
                    }
                    self.$calendar.fullCalendar('unselect');
                },

                // Options

                weekNumbers: true,
                snapMinutes: 15,

            }, defaultOptions));

        },

        /**
         * Refresh one fullcalendar event identified by it's 'id' by reading OpenERP record state.
         * If event was not existent in fullcalendar, it'll be created.
         */
        refresh_event: function(id) {
            var self = this;
            // XXXvlab: we needed to use parseInt, but how will this work with recurring events ?
            this.dataset.read_ids([parseInt(id)], _.keys(this.fields)).done(function (record) {
                // Event boundaries were already changed by fullcalendar, but we need to reload them:
                var new_event = self.event_data_transform(record[0]);
                // fetch event_obj
                var event_objs = self.$calendar.fullCalendar('clientEvents', id);
                if (event_objs.length == 1) { // Already existing obj to update
                    var event_obj = event_objs[0];
                    // update event_obj
                    _(new_event).each(function (value, key) {
                        event_obj[key] = value;
                    });
                    self.$calendar.fullCalendar('updateEvent', event_obj);
                } else { // New event object to create
                    self.$calendar.fullCalendar('renderEvent', new_event, true);
                }
            });
        },

        // get_color: function(key) {
        //     if (this.color_map[key]) {
        //         return this.color_map[key];
        //     }
        //     var index = _.keys(this.color_map).length % this.COLOR_PALETTE.length;
        //     var color = this.COLOR_PALETTE[index];
        //     this.color_map[key] = color;
        //     return color;
        // },

        /**
         * Transform OpenERP event object to fullcalendar event object
         */
        event_data_transform: function(evt) {
            var date_start = instance.web.auto_str_to_date(evt[this.date_start]),
                date_stop = this.date_stop ? instance.web.auto_str_to_date(evt[this.date_stop]) : null,
                date_delay = evt[this.date_delay] || 1.0,
                res_text = '';

            if (this.date_stop && this.fields[this.date_stop].type == 'date') {
                date_stop.addDay(1);
            }

            if (this.info_fields) {
                res_text = _.map(this.info_fields, function(fld) {
                    if(evt[fld] instanceof Array)
                        return evt[fld][1];
                    return evt[fld];
                });
            }
            if (!date_stop && date_delay) {
                date_stop = date_start.clone().addHours(date_delay);
            }
            var r = {
                'start': date_start.toString('yyyy-MM-dd HH:mm:ss'),
                'end': date_stop.toString('yyyy-MM-dd HH:mm:ss'),
                'title': res_text.join(', '),
                // check this with recurring data !
                'allDay': (this.fields[this.date_start].type == 'date' ||
                           (this.all_day && evt[this.all_day])),
                'id': evt.id,
            };
            if (evt.color) {
                r.color = evt.color;
            }
            if (evt.textColor) {
                r.textColor = evt.textColor;
            }
            return r;
        },

        /**
         * Transform fullcalendar event object to OpenERP Data object
         */
        get_event_data: function(event) {
            var data = {
                name: event.title
            };
            data[this.date_start] = instance.web.parse_value(event.start, this.fields[this.date_start]);
            if (this.date_stop) {
                data[this.date_stop] = instance.web.parse_value(event.end, this.fields[this.date_stop]);
            }
            if (this.all_day) {
                data[this.all_day] = event.allDay;
            }
            if (this.date_delay) {
                // XXXvlab: what if different dates ?
                var diff_seconds = Math.round((event.end.getTime() - event.start.getTime()) / 1000);
                data[this.date_delay] = diff_seconds / 3600;
            }
            return data;
        },
        do_search: function(domain, context, _group_by) {
            var self = this;
            $.when(this.ready).done(function() {
                if (typeof self.event_source !== "undefined")
                    self.$calendar.removeEventSource(self.event_source);
                self.event_source = {
                    events: function(start, end, callback) {
                        self.dataset.read_slice(_.keys(self.fields), {
                            offset: 0,
                            domain: self.get_range_domain(domain, start, end),
                            context: context,
                        }).done(function(events) {
                            return callback(events);
                        });
                    },
                    eventDataTransform: function (event) {
                        return self.event_data_transform(event);
                    },
                };

                self.$calendar.fullCalendar('addEventSource', self.event_source);
            });

        },
        /**
         * Build OpenERP Domain to filter object by this.date_start field
         * between given start, end dates.
         */
        get_range_domain: function(domain, start, end) {
            var format = instance.web.date_to_str;
            domain.unshift([this.date_start, '>=', format(start.clone())]);
            domain.unshift([this.date_start, '<=', format(end.clone())]);
            return domain;
        },

        do_show: function () {
            var self = this;
            $.when(this.ready).done(function() {
                self.$el.show();
                self.do_push_state({});
            });
        },

        quick_save: function(event_obj) {
            var self = this;
            var data = this.get_event_data(event_obj);
            delete(data.name); // Cannot modify actual name yet
            var index = this.dataset.get_id_index(event_obj._id);
            if (index !== null) {
                event_id = this.dataset.ids[index];
                this.dataset.write(event_id, data, {}).done(function() {
                    self.refresh_event(event_id);
                });
            }
            return false;
        },
        quick_create: function(event_data) {
            var self = this;
            var data = this.get_event_data(event_data);
            this.dataset.create(data).done(function(id) {
                self.dataset.ids.push(id);
                self.refresh_event(id);
            }).fail(function(r, event) {
                event.preventDefault();
                // This will occurs if there are some more fields required
                self.slow_create(event_data);
            });
        },
        slow_create: function(event_data) {
            var self = this;
            var defaults = {};
            _.each(this.get_event_data(event_data), function(val, field_name) {
                defaults['default_' + field_name] = val;
            });
            var something_saved = false;
            var pop = new instance.web.form.FormOpenPopup(this);
            pop.show_element(this.dataset.model, null, this.dataset.get_context(defaults), {
                title: _t("Create: ") + ' ' + this.name,
                disable_multiple_selection: true,
            });
            // pop.on('closed', self, function() {
            // });
            pop.on('create_completed', self, function(id) {
                something_saved = true;
                self.dataset.ids.push(id);
                self.refresh_event(id);
            });
        },
        open_event: function(id) {
            var index = this.dataset.get_id_index(id);
            this.dataset.index = index;
            this.do_switch_view('form');
            return false;
        },
    });

};

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
