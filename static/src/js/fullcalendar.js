/*globals: openerp, $, console */

/*---------------------------------------------------------
 * OpenERP web_calendar
 *---------------------------------------------------------*/

openerp.web_fullcalendar = function(instance) {

    var _t = instance.web._t,
        _lt = instance.web._lt;
    var QWeb = instance.web.qweb;

    function get_class(name) {
        return new instance.web.Registry({'tmp' : name}).get_object("tmp");
    }

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

    function is_virtual_id(id) {
        return typeof id == "string" && id.indexOf('-') >= 0;
    }

    instance.web.views.add('calendar', 'instance.web_fullcalendar.FullCalendarView');

    instance.web_fullcalendar.FullCalendarView = instance.web.View.extend({
        template: "FullCalendarView",
        display_name: _lt('Calendar'),
        quick_create_class: 'instance.web_calendar.QuickCreate',

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

        set_default_options: function(options) {
            this._super(options);
            _.defaults(this.options, {
                // All possible views options should be defaulted here
                confirm_on_delete: true,
            });
        },

        destroy: function() {
            this.$calendar.fullCalendar('destroy');
            this._super.apply(this, arguments);
        },

        view_loading: function (fv) {
            var self = this;

            this.fields_view = fv;

            this.$calendar = this.$el.find(".oe_fullcalendar_widget");

            this.info_fields = [];

            /* buttons */

            this.$buttons = $(QWeb.render("CalendarView.buttons", {'widget': this}));
            if (this.options.$buttons) {
                this.$buttons.appendTo(this.options.$buttons);
            } else {
                this.$el.find('.oe_calendar_buttons').replaceWith(this.$buttons);
            }

            this.$buttons.on('click', 'button.oe_calendar_button_new', function () {
                self.dataset.index = null;
                self.do_switch_view('form');
            });

            /* xml view calendar options */

            var attrs = fv.arch.attrs;

            if (!attrs.date_start) {
                throw new Error(_t("Calendar view has not defined 'date_start' attribute."));
            }

            this.$el.addClass(attrs['class']);

            this.name = fv.name || attrs.string;
            this.view_id = fv.view_id;


            this.mode = attrs.mode;              // one of month, week or day
            this.date_start = attrs.date_start;  // Field name of starting date field
            this.date_delay = attrs.date_delay;  // duration
            this.date_stop = attrs.date_stop;
            this.all_day = attrs.all_day;        // boolean

            this.color_field = attrs.color;
            this.color_string = fv.fields[this.color_field] ?
                fv.fields[this.color_field].string : _t("Filter");

            if (this.color_field && this.selected_filters.length === 0) {
                var default_filter;
                if ((default_filter = this.dataset.context['calendar_default_' + this.color_field])) {
                    this.selected_filters.push(default_filter + '');
                }
            }
            this.fields = fv.fields;


            for (var fld = 0; fld < fv.arch.children.length; fld++) {
                this.info_fields.push(fv.arch.children[fld].attrs.name);
            }

            return (new instance.web.Model(this.dataset.model))
                .call("check_access_rights", ["create", false])
                .then(function (create_right) {
                    self.create_right = create_right;
                    self.init_fullcalendar().then(function() {
                        self.trigger('calendar_view_loaded', fv);
                        self.ready.resolve();
                    });
                });

        },

        get_fc_init_options: function () {
            var self = this;
            return $.extend({}, defaultOptions, {

                defaultView: (this.mode == "month")?"month":
                    (this.mode == "week"?"agendaWeek":
                     (this.mode == "day"?"agendaDay":"month")),
                header: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay'
                },
                selectable: !this.options.read_only_mode && this.create_right,
                selectHelper: true,
                editable: !this.options.read_only_mode,

                // callbacks

                eventDrop: function (event, _day_delta, _minute_delta, _all_day, _revertFunc) {
                    var data = self.get_event_data(event);
                    self.proxy('update_record')(event._id, data); // we don't revert the event, but update it.
                },
                eventResize: function (event, _day_delta, _minute_delta, _revertFunc) {
                    var data = self.get_event_data(event);
                    self.proxy('update_record')(event._id, data);
                },
                eventRender: function (event, element, view) {
                    if (!self.options.read_only_mode) {
                        self.append_deletion_handle(event, element, view);
                    }
                },
                eventClick: function (event) { self.open_event(event._id); },
                select: function (start_date, end_date, all_day, _js_event, _view) {
                    var data_template = self.get_event_data({
                        start: start_date,
                        end: end_date,
                        allDay: all_day,
                    });

                    // Opening quick create widget

                    if (self.quick) {
                        return self.quick.trigger('close');
                    }
                    self.quick = new (get_class(self.quick_create_class))(
                        self, self.dataset, true, data_template)
                        .on('added', self, self.proxy('quick_created'))
                        .on('close', self, function() {
                            this.quick.destroy();
                            delete this.quick;
                            self.$calendar.fullCalendar('unselect');
                        });
                    self.quick.replace($(".oe_calendar_qc_placeholder"));
                    self.quick.focus();
                },
                unselectAuto: false,

                // Options

                weekNumbers: true,
                snapMinutes: 15,

            });
        },

        init_fullcalendar: function() {
            this.$calendar.fullCalendar(this.get_fc_init_options());
            return $.when();
        },

        /**
         * Refresh one fullcalendar event identified by it's 'id' by reading OpenERP record state.
         * If event was not existent in fullcalendar, it'll be created.
         */
        refresh_event: function(id) {
            var self = this;
            if (is_virtual_id(id))
                // Should avoid "refreshing" a virtual ID because it can't
                // really be modified so it should never be refreshed. As upon
                // edition, a NEW event with a non-virtual id will be created.
                console.warn("Unwise use of refresh_event on a virtual ID.");
            this.dataset.read_ids([id], _.keys(this.fields)).done(function (record) {
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
                    self.$calendar.fullCalendar('renderEvent', new_event);
                    // By forcing attribution of this event to this source, we
                    // make sure that the event will be removed when the source
                    // will be removed (which occurs at each do_search)
                    self.$calendar.fullCalendar('clientEvents', id)[0].source = self.event_source;
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
            var self = this;
            var date_start = instance.web.auto_str_to_date(evt[this.date_start]),
                date_stop = this.date_stop ? instance.web.auto_str_to_date(evt[this.date_stop]) : null,
                date_delay = evt[this.date_delay] || 1.0,
                all_day = this.all_day ? evt[this.all_day] : false,
                res_text = '';

            if (this.date_stop && this.fields[this.date_stop].type == 'date') {
                date_stop.addDay(1);
            }

            if (this.info_fields) {
                res_text = _.reject(_.map(this.info_fields, function(fieldname) {
                    var value = evt[fieldname];
                    if (_.contains(["one2many", "many2one", "one2one", "many2many"],
                                   self.fields[fieldname].type)) {
                        if (value === false) return null;
                    }
                    if(value instanceof Array)
                        return value[1];
                    return value;
                }), function (x) {
                    return x === null;
                });
            }
            if (!date_stop && date_delay) {
                date_stop = date_start.clone().addHours(date_delay);
            }
            if (this.fields[this.date_start].type != "date" && all_day) {
                date_stop.addDays(-1);
            }
            var r = {
                'start': date_start.toString('yyyy-MM-dd HH:mm:ss'),
                'end': date_stop.toString('yyyy-MM-dd HH:mm:ss'),
                'title': res_text.join(', '),
                // check this with recurring data !
                'allDay': (this.fields[this.date_start].type == 'date' ||
                           (this.all_day && evt[this.all_day]) || false),
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

            // Normalize event_end without changing fullcalendars event.
            var event_end = event.end;
            if (event.allDay) {
                // Sometimes fullcalendar doesn't give any event.end.
                if (event_end === null)
                    event_end = event.start;
                // Avoid inplace changes
                event_end = (new Date(event_end.getTime())).addDays(1);
            }

            var data = {
                name: event.title
            };
            data[this.date_start] = instance.web.parse_value(event.start, this.fields[this.date_start]);
            if (this.date_stop) {
                data[this.date_stop] = instance.web.parse_value(event_end, this.fields[this.date_stop]);
            }
            if (this.all_day) {
                data[this.all_day] = event.allDay;
            }
            if (this.date_delay) {
                // XXXvlab: what if different dates ?
                var diff_seconds = Math.round((event_end.getTime() - event.start.getTime()) / 1000);
                data[this.date_delay] = diff_seconds / 3600;
            }
            return data;
        },
        do_search: function(domain, context, _group_by) {
            var self = this;
            if (typeof this.event_source !== "undefined")
                this.$calendar.fullCalendar('removeEventSource', this.event_source);
            this.event_source = {
                events: function(start, end, callback) {
                    var current_event_source = self.event_source;
                    self.dataset.read_slice(_.keys(self.fields), {
                        offset: 0,
                        domain: self.get_range_domain(domain, start, end),
                        context: context,
                    }).done(function(events) {
                        if (self.event_source !== current_event_source) {
                            // Event source changed while waiting for AJAX response
                            console.log("Consecutive ``do_search`` called. Cancelling.");
                            return;
                        }
                        return callback(events);
                    });
                },
                eventDataTransform: function (event) {
                    return self.event_data_transform(event);
                },
            };
            this.$calendar.fullCalendar('addEventSource', this.event_source);
        },
        /**
         * Build OpenERP Domain to filter object by this.date_start field
         * between given start, end dates.
         */
        get_range_domain: function(domain, start, end) {
            var format = instance.web.date_to_str;
            return new instance.web.CompoundDomain(
                domain,
                [[this.date_start, '>=', format(start.clone())],
                 [this.date_start, '<=', format(end.clone())]]);
        },

        // do_show: function () {
        //     this.$el.show();
        // },

        /**
         * Updates record identified by ``id`` with values in object ``data``
         */
        update_record: function(id, data) {
            var self = this;
            delete(data.name); // Cannot modify actual name yet
            var index = this.dataset.get_id_index(id);
            if (index !== null) {
                event_id = this.dataset.ids[index];
                this.dataset.write(event_id, data, {}).done(function() {
                    if (is_virtual_id(event_id)) {
                        // this is a virtual ID and so this will create a new event
                        // with an unknown id for us.
                        self.$calendar.fullCalendar('refetchEvents');
                    } else {
                        // classical event that we can refresh
                        self.refresh_event(event_id);
                    }
                });
            }
            return false;
        },
        open_event: function(id) {
            var index = this.dataset.get_id_index(id);
            this.dataset.index = index;
            this.do_switch_view('form');
            return false;
        },

        do_show: function() {
            if (this.$buttons) {
                this.$buttons.show();
            }
            this.do_push_state({});
            return this._super();
        },
        do_hide: function () {
            if (this.$buttons) {
                this.$buttons.hide();
            }
            return this._super();
        },
        is_action_enabled: function(action) {
            if (action === 'create' && !this.options.creatable)
                return false;
            return this._super(action);
        },

        /**
         * Handles a newly created record
         *
         * @param {id} id of the newly created record
         */
        quick_created: function (id) {

            /** Note:
             * it's of the most utter importance NOT to use inplace
             * modification on this.dataset.ids as reference to this
             * data is spread out everywhere in the various widget.
             * Some of these reference includes values that should
             * trigger action upon modification.
             */
            this.dataset.ids = this.dataset.ids.concat([id]);
            // Inform every body that dataset changed
            this.dataset.trigger("dataset_changed", id);
            this.refresh_event(id);
        },

        append_deletion_handle: function (event, element, view) {
            var self = this;
            var $x = $("<a type='delete'><div class='close-btn'>x</div></a>")
                .on('click', function(ev) {
                    self.remove_event(event.id);
                    ev.preventDefault();
                    return false;
                });
            element.prepend($x);
        },

        remove_event: function(id) {
            var self = this;
            function do_it() {
                return $.when(self.dataset.unlink([id])).done(function() {
                    self.$calendar.fullCalendar('removeEvents', id);
                });
            }
            if (this.options.confirm_on_delete) {
                if (confirm(_t("Are you sure you want to delete this record ?"))) {
                    return do_it();
                }
            } else
                return do_it();
        },
    });


    /**
     * Quick creation view.
     *
     * Triggers a single event "added" with a single parameter "name", which is the
     * name entered by the user
     *
     * @class
     * @type {*}
     */
    instance.web_calendar.QuickCreate = instance.web.Widget.extend({
        template: 'CalendarView.quick_create',

        /**
         * close_btn: If true, the widget will display a "Close" button able to trigger
         * a "close" event.
         */
        init: function(parent, dataset, buttons, data_template) {
            this._super(parent);
            this.dataset = dataset;
            this._buttons = buttons || false;

            // Can hold data pre-set from where you clicked on agenda
            this.data_template = data_template || {};
        },
        get_title: function () {
            return _t("Create: ") + (this.getParent().string || this.getParent().name);
        },
        start: function () {
            var self = this;
            self.$input = this.$el.find('input');
            self.$input.keyup(function(event){
                if(event.keyCode == 13){
                    self.quick_add();
                }
            });
            $(".oe_calendar_quick_create_add", this.$el).click(function () {
                self.quick_add();
                self.focus();
            });
            $(".oe_calendar_quick_create_close", this.$el).click(function (ev) {
                ev.preventDefault();
                self.trigger('close');
            });
            self.$input.keyup(function(e) {
                if (e.keyCode == 27 && self._buttons) {
                    self.trigger('close');
                }
            });
            self.$el.dialog({ title: this.get_title()});
            self.on('added', self, function() {
                self.trigger('close');
            });
        },
        focus: function() {
            this.$el.find('input').focus();
        },

        /**
         * Gathers data from the quick create dialog a launch quick_create(data) method
         */
        quick_add: function() {
            var val = this.$input.val();
            if (/^\s*$/.test(val)) { return; }
            this.quick_create({'name': val});
        },

        /**
         * Handles saving data coming from quick create box
         */
        quick_create: function(data, options) {
            var self = this;
            this.dataset.create($.extend({}, this.data_template, data), options)
                .then(function(id) {
                    self.$input.val("");
                    self.trigger('added', id);
                }).fail(function(r, event) {
                    event.preventDefault();
                    // This will occurs if there are some more fields required
                    self.slow_create(data);
                });
        },

        /**
         * Show full form popup
         */
        slow_create: function(data) {
            var self = this;
            var defaults = {};
            _.each(data, function(val, field_name) {
                defaults['default_' + field_name] = val;
            });

            var something_saved = false;
            var pop = new instance.web.form.FormOpenPopup(this);
            pop.show_element(this.dataset.model, null, defaults, {
                title: this.get_title(),
                disable_multiple_selection: true,
                // Ensuring we use ``self.dataset`` and DO NOT create a new one.
                create_function: function(data, options) {
                    return self.dataset.create(data, options).done(function(r) {
                        // Although ``self.dataset.create`` DOES not call ``dataset_changed`` in O2M
                        // it gets called thanks to ``create_completed`` -> ``added``
                        // XXXvlab: why ``create`` does not call dataset_changed AND adds id in dataset.ids
                        // is a mystery for me ATM.
                    }).fail(function (r, event) {
                        throw new Error(r);
                    });
                },

                // ATM this method should not be attainable as the current pop up is
                // spawned only for newly created objects.

                // write_function: function(id, data, options) {
                //     return self.dataset.write(id, data, options).done(function() {
                //     }).fail(function (r, event) {
                //         throw new Error(r);
                //     });
                // },
                read_function: function(id, fields, options) {
                    return self.dataset.read_ids.apply(self.dataset, arguments).done(function() {
                    }).fail(function (r, event) {
                        throw new Error(r);
                    });
                },


            });
            // pop.on('closed', self, function() {
            // });
            pop.on('create_completed', self, function(id) {
                something_saved = true;
                self.trigger('added', id);
            });
        },
    });


    /**
     * Form widgets
     */

    function widget_calendar_lazy_init() {
        if (instance.web.form.Many2ManyCalendarView)
            return;

        instance.web_fullcalendar.FieldFullCalendarView = instance.web_fullcalendar.FullCalendarView.extend({

            init: function (parent) {
                this._super.apply(this, arguments);
                // Warning: this means only a field_widget should instanciate this Class
                this.field_widget = parent;
            },

            view_loading: function (fv) {
                var self = this;
                return $.when(this._super.apply(this, arguments)).then(function() {
                    self.on('event_rendered', this, function (event, element, view) {
                        self.append_deletion_handle(event, element, view);
                    });
                });
            },

            // In forms, we could be hidden in a notebook. Thus we couldn't
            // render correctly fullcalendar so we try to detect when we are
            // not visible to wait for when we will be visible.
            init_fullcalendar: function() {
                if (this.$calendar.width() !== 0) { // visible
                    return this._super();
                }

                // find all parents tabs.
                var def = $.Deferred();
                var self = this;
                this.$calendar.parents(".ui-tabs").on('tabsactivate', this, function() {
                    if (self.$calendar.width() !== 0) { // visible
                        self.$calendar.fullCalendar(self.get_fc_init_options());
                        def.resolve();
                    }
                });
                return def;
            },


        });

    }

    instance.web_fullcalendar.BufferedDataSet = instance.web.BufferedDataSet.extend({

        /**
         * Adds verification on possible missing fields for the sole purpose of
         * O2M dataset being compatible with the ``slow_create`` detection of
         * missing fields... which is as simple to try to write and upon failure
         * go to ``slow_create``. Current BufferedDataSet would'nt fail because
         * they do not send data to the server at create time.
         */
        create: function (data, options) {
            var def = $.Deferred();
            var self = this;
            var create = this._super;
            if (typeof this.required_fields === "undefined") {
                this.required_fields = (new instance.web.Model(this.model))
                    .call('fields_get').then(function (fields_def) {
                        return _(fields_def).chain()
                         // equiv to .pairs()
                            .map(function (value, key) { return [key, value]; })
                         // equiv to .omit(self.field_widget.field.relation_field)
                            .filter(function (pair) { return pair[0] !== self.field_widget.field.relation_field; })
                            .filter(function (pair) { return pair[1].required; })
                            .map(function (pair) { return pair[0]; })
                            .value();
                    });
            }
            $.when(this.required_fields).then(function (required_fields) {
                var missing_fields = _(required_fields).filter(function (v) {
                    return typeof data[v] === "undefined";
                });
                var default_get = (missing_fields.length !== 0) ?
                    self.default_get(missing_fields) : [];
                $.when(default_get).then(function (defaults) {

                    // Remove all fields that have a default from the missing fields.
                    missing_fields = _(missing_fields).filter(function (f) {
                        return typeof defaults[f] === "undefined";
                    });
                    if (missing_fields.length !== 0) {
                        def.reject(
                            _.str.sprintf(
                                _t("Missing required fields %s"), missing_fields.join(", ")),
                            $.Event());
                        return;
                    }
                    create.apply(self, [data, options]).then(function (result) {
                        def.resolve(result);
                    });
                });
            });
            return def;
        },
    });

    instance.web_fullcalendar.fields_dataset = new instance.web.Registry({
        'many2many': 'instance.web.DataSetStatic',
        'one2many': 'instance.web_fullcalendar.BufferedDataSet',
    });


    function get_field_dataset_class(type) {
        var obj = instance.web_fullcalendar.fields_dataset.get_any([type]);
        if (!obj) {
            throw new Error(_.str.sprintf(_t("Dataset for type '%s' is not defined."), type));
        }

        // Override definition of legacy datasets to add field_widget context
        return obj.extend({
            init: function (parent) {
                this._super.apply(this, arguments);
                this.field_widget = parent;
            },
            get_context: function() {
                this.context = this.field_widget.build_context();
                return this.context;
            }
        });
    }

    /**
     * Common part to manage any field using calendar view
     */
    instance.web_fullcalendar.FieldCalendar = instance.web.form.AbstractField.extend({

        disable_utility_classes: true,
        fullcalendar_view_class: 'instance.web_fullcalendar.FieldFullCalendarView',

        init: function(field_manager, node) {
            this._super(field_manager, node);
            widget_calendar_lazy_init();
            this.is_loaded = $.Deferred();
            this.initial_is_loaded = this.is_loaded;

            var self = this;

            // This dataset will use current widget to '.build_context()'.
            var field_type = field_manager.fields_view.fields[node.attrs.name].type;
            this.dataset = new (get_field_dataset_class(field_type))(
                this, this.field.relation);

            this.dataset.on('unlink', this, function(_ids) {
                this.dataset.trigger('dataset_changed');
            });

            // quick_create widget instance will be attached when spawned
            this.quick_create = null;

            this.no_rerender = true;

        },

        start: function() {
            this._super.apply(this, arguments);

            var self = this;

            self.load_view();
            self.on("change:effective_readonly", self, function() {
                self.is_loaded = self.is_loaded.then(function() {
                    self.calendar_view.destroy();
                    return $.when(self.load_view()).done(function() {
                        self.render_value();
                    });
                });
            });
        },

        load_view: function() {
            var self = this;
            var calendar_view_class = get_class(this.fullcalendar_view_class);
            this.calendar_view = new calendar_view_class(this, this.dataset, false, {
                'create_text': _t("Add"),
                'creatable': self.get("effective_readonly") ? false : true,
                'quick_creatable': self.get("effective_readonly") ? false : true,
                'read_only_mode': self.get("effective_readonly") ? true : false,
                'confirm_on_delete': false,
            });
            var embedded = (this.field.views || {}).calendar;
            if (embedded) {
                this.calendar_view.set_embedded_view(embedded);
            }
            var loaded = $.Deferred();
            this.calendar_view.on("calendar_view_loaded", self, function() {
                self.initial_is_loaded.resolve();
                loaded.resolve();
            });
            this.calendar_view.on('switch_mode', this, this.open_popup);
            $.async_when().done(function () {
                self.calendar_view.appendTo(self.$el);
            });
            return loaded;
        },

        render_value: function() {
            var self = this;
            this.dataset.set_ids(this.get("value"));
            this.is_loaded = this.is_loaded.then(function() {
                return self.calendar_view.do_search(self.build_domain(), self.dataset.get_context(), []);
            });
        },

        open_popup: function(type, unused) {
            if (type !== "form")
                return;
            if (this.dataset.index === null) {
                if (typeof this.open_popup_add === "function")
                    this.open_popup_add();
            } else {
                if (typeof this.open_popup_edit === "function")
                    this.open_popup_edit();
            }
        },
        open_popup_add: function() {
            throw new Error("Not Implemented");
        },
        open_popup_edit: function() {
            var id = this.dataset.ids[this.dataset.index];
            var self = this;
            var pop = (new instance.web.form.FormOpenPopup(this));
            pop.show_element(this.field.relation, id, this.build_context(), {
                title: _t("Open: ") + this.string,
                write_function: function(id, data, _options) {
                    return self.dataset.write(id, data, {}).done(function() {
                        // Note that dataset will trigger itself the
                        // ``dataset_changed`` signal
                        self.calendar_view.refresh_event(id);
                    });
                },
                alternative_form_view: this.field.views ? this.field.views.form : undefined,
                parent_view: this.view, //XXXvlab: to check ! this.view is likely undefined
                child_name: this.name,
                readonly: this.get("effective_readonly")
            });
        }
    });

    instance.web_fullcalendar.FieldMany2ManyCalendar = instance.web_fullcalendar.FieldCalendar.extend({

        init: function(field_manager, node) {
            this._super(field_manager, node);
            this.dataset.on('dataset_changed', this, function() {
                // Will set dirty state if necessary
                this.set({'value': this.dataset.ids});
            });
        },

        set_value: function(value_) {
            value_ = value_ || [];
            if (value_.length >= 1 && value_[0] instanceof Array) {
                value_ = value_[0][2];
            }
            this._super(value_);
        },

        get_value: function() {
            // see to use ``commands.replace_with`` provided in
            // ``instance.web.form`` but not yet shared.
            return [[6, false, this.get('value')]];
        },
        open_popup_add: function() {
            var pop = (new instance.web.form.SelectCreatePopup(this));
            var self = this;
            pop.select_element(
                this.field.relation,
                {
                    title: _t("Add: ") + this.string
                },
                new instance.web.CompoundDomain(
                    this.build_domain(),
                    ["!", ["id", "in", this.dataset.ids]]),
                this.build_context()
            );
            pop.on("elements_selected", this, function(element_ids) {
                _.each(element_ids, function(id) {
                    if (!_.detect(self.dataset.ids, function(x) {return x == id;})) {
                        self.dataset.set_ids([].concat(self.dataset.ids, [id]));
                        self.calendar_view.refresh_event(id);
                    }
                    self.dataset.trigger("dataset_changed");
                });
            });
        }

    });


    instance.web_fullcalendar.FieldOne2ManyCalendar = instance.web_fullcalendar.FieldCalendar.extend({

        init: function(field_manager, node) {
            this._super(field_manager, node);
            this.dataset.on('dataset_changed', this, function() {
                // Force dirty state, as if dataset changed, then 'get_value'
                // result will change because it uses directly the dataset to
                // compute its result.
                this.trigger('changed_value');
            });
        },

        set_value: instance.web.form.FieldOne2Many.prototype.set_value,
        get_value: instance.web.form.FieldOne2Many.prototype.get_value,
        // XXX needed by set_value for no reason at all, TO REMOVE when
        // FieldOne2Many.set_value will be cleaned.
        trigger_on_change: function() {},
        reload_current_view: function() {},

        open_popup_add: false, // deactivate button "Add"

    });


    instance.web.form.widgets.add('many2many_calendar','instance.web_fullcalendar.FieldMany2ManyCalendar');
    instance.web.form.widgets.add('one2many_calendar','instance.web_fullcalendar.FieldOne2ManyCalendar');

};

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
