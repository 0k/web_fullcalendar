===========================
OpenERP fullcalendar module
===========================

This module replaces default old DXHTML calendar view from OpenERP 7.0 with
a the excellent `fullcalendar from Adam Shaw`_.

.. _fullcalendar from Adam Shaw: http://arshaw.com/fullcalendar/


Requirements
============

This module was tested on OpenERP 7.0.

As OpenERP 7.0 calendar implementation has numerous bugs, and that true
modularity is not attained in current code, you'll need to apply some
modification to OpenERP code base.

There are modification to apply to ``openobject-server`` and
``openobject-addons``. You can apply the branches or apply the patches that are
provided with this source code. All instructions are in the Install_ section.


Why
===

OpenERP 7.0 calendar view has numerous bugs and the result wasn't sexy
neither. Integrating an existing solution seemed a better idea so that
the calendar code would be rock-solid, and supported by a large community.


Features
========

- full day event support
- external element drop
- provides a full view as replacement of calendar view, and One2Many,
  Many2Many Form field widgets to use in form views.
- Read-only mode (can't drag/drop, or create new event on click)


Install
=======

module installation
-------------------


This module is a standard OpenERP module and it should be installed as such. Be
aware that once installed, it'll replace the old calendar view. No model nor
objects are created, this is a 100% javascript module. For more information on
how to use it in form, please head to the section Usage_.

OpenERP code base modifications
-------------------------------

You'll need also to apply patches to ``openobject-addons`` and
``openobject-server``. There are two different way to do this depending on whether
you feel more confortable merging bzr branches or applying patches. The latter is
the mandatory choice if your OpenERP code is NOT in a bzr repository.


bzr merges
''''''''''

You should use this method only if your code comes from bzr and is version controlled
by bazaar.

These are link the branches you should merge to your code base for:

- ``openobject-server``: `support for o2m and m2m calendar widget`_.
- ``openobject-addons``: `recurrence fixes`_.

.. _support for o2m and m2m calendar widget: https://code.launchpad.net/~0k.io/openobject-server/calendar-parsing-and-xml-syntax
.. _recurrence fixes: https://code.launchpad.net/~0k.io/openobject-addons/fix-base-calendar-bugs2


apply patches
'''''''''''''

Patches to ``openobject-server`` and ``openobject-addons`` are bundled in the ``web_fullcalendar``
repository in the ``patches/`` directory.

Apply the patches to ``openobject-server`` code base::

    cd MY_OPENOBJECT_SERVER_ROOT_PATH
    cat MY_WEBFULLCALENDAR_SOURCE_PATH/patches/openobject-server/*.patch | patch -p 1


Apply the patches to ``openobject-addons`` code base::

    cd MY_OPENOBJECT_SERVER_ROOT_PATH
    cat MY_WEBFULLCALENDAR_SOURCE_PATH/patches/openobject-server/*.patch | patch -p 1


Usage
=====


View
----

You have nothing special to do. All calendar view will be replaced by
``web_fullcalendar``. Please note that you have a new attribute that you can
use when declaring your ``calendar`` view::

    <calendar string="Events" date_start="date" color="show_as" date_delay="duration" all_day="allday">
       ...
    </calendar>


This attributes, as ``date_start``, ``date_delay`` needs to get the field name
of a boolean field name that should be filled with ``True`` whenever tasks to
be create are full-day tasks.


Widget
------

You can use the ``calendar`` view in ``one2many`` or ``many2many``, here's an example::

    ...
      <field name="meeting_ids" widget="many2many_calendar">
        <calendar date_start="date" color="user_id" date_stop="date_deadline" date_delay="duration" all_day="allday">
          <field name="name"/>
        </calendar>
      </field>
    ...

Notice the ``widget`` attribute set to ``many2many_calendar`` in the containing field declaration.
