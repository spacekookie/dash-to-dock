const Clutter = imports.gi.Clutter;
const GdkPixbuf = imports.gi.GdkPixbuf
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Util = imports.misc.util;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

let tracker = Shell.WindowTracker.get_default();

const IndicatorStyle = {
    DEFAULT: 0,
    RUNNING_DOTS: 1,
    GLOSSY_COLORED_BACKLIT: 2
};

const MAX_WINDOWS_CLASSES = 4;

/*
 * A base indicator class, from which all other should derive, providing css
 * style classes handling.
 *
 */
const AppIconIndicatorBase = new Lang.Class({

    Name: 'DashToDock.AppIconIndicatorBase',

    _init: function(source, settings) {
        this._settings = settings;
        this._source = source;

        this._signalsHandler = new Utils.GlobalSignalsHandler();
        this._nWindows = 0;
        // These statuse take into account the workspace/monitor isolation
        this._isFocused = false;
        this._isRunning = false;
    },

    update: function() {
        // Limit to 1 to MAX_WINDOWS_CLASSES  windows classes
        this._nWindows = Math.min(this._source.getInterestingWindows().length, MAX_WINDOWS_CLASSES);

        // We need to check the number of windows, as the focus might be
        // happening on another monitor if using isolation
        if (tracker.focus_app == this._source.app && this._nWindows > 0)
            this._isFocused = true;
        else
            this._isFocused = false;

        // In the case of workspace isolation, we need to hide the dots of apps with
        // no windows in the current workspace
        if (this._source.app.state != Shell.AppState.STOPPED  && this._nWindows > 0)
            this._isRunning = true;
        else
            this._isRunning = false;

        this._updateCounterClass();
        this._updateFocusClass();
        this._updateDefaultDot();
    },

    _updateCounterClass: function() {
        for (let i = 1; i <= MAX_WINDOWS_CLASSES; i++) {
            let className = 'running' + i;
            if (i != this._nWindows)
                this._source.actor.remove_style_class_name(className);
            else
                this._source.actor.add_style_class_name(className);
        }
    },

    _updateFocusClass: function() {
        if (this._isFocused)
            this._source.actor.add_style_class_name('focused');
        else
            this._source.actor.remove_style_class_name('focused');
    },

    _updateDefaultDot: function() {
        if (this._isRunning)
            this._source._dot.show();
        else
            this._source._dot.hide();
    },

    _hideDefaultDot: function() {
        // I use opacity to hide the default dot because the show/hide function
        // are used by the parent class.
        this._source._dot.opacity = 0;
    },

    _restoreDefaultDot: function() {
        this._source._dot.opacity = 255;
    },

    destroy: function() {
        this._signalsHandler.destroy();
        this._restoreDefaultDot();
    }
});

const RunningDotsIndicator = new Lang.Class({

    Name: 'DashToDock.RunningDotsIndicator',
    Extends: AppIconIndicatorBase,

    _init: function(source, settings) {

        this.parent(source, settings)

        this._hideDefaultDot();

        this._dots = new St.DrawingArea({x_expand: true, y_expand: true});
        this._dots.connect('repaint', Lang.bind(this, this._drawCircles));
        this._source._iconContainer.add_child(this._dots);

        let keys = ['custom-theme-running-dots-color',
                   'custom-theme-running-dots-border-color',
                   'custom-theme-running-dots-border-width'];

        keys.forEach(function(key) {
            this._signalsHandler.add([
                this._settings,
                'changed::' + key,
                Lang.bind(this, this.update)
            ]);
        }, this);
    },

    update: function() {
        this.parent();
        if (this._dots)
            this._dots.queue_redraw(); //not necessary becuase a redraw occurs triggered by the class style applied I guesss
    },

    // Return the styles used to draw the dots
    // This function can be replaced in inheriting classes
    _getDotsStyle: function() {
        let borderColor, borderWidth, bodyColor, radius, padding, spacing;

        // TODO this is a bit duplicated also inside _drawCircles
        let area = this._dots;
        let side =  Utils.getPosition(this._settings);
        let [width, height] = area.get_surface_size();

        if (!this._settings.get_boolean('apply-custom-theme')
            && this._settings.get_boolean('custom-theme-running-dots')
            && this._settings.get_boolean('custom-theme-customize-running-dots')) {
            borderColor = Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-border-color'))[1];
            borderWidth = this._settings.get_int('custom-theme-running-dots-border-width');
            bodyColor =  Clutter.color_from_string(this._settings.get_string('custom-theme-running-dots-color'))[1];
        }
        else {
            // Re-use the style - background color, and border width and color -
            // of the default dot
            let themeNode = this._source._dot.get_theme_node();
            borderColor = themeNode.get_border_color(side);
            borderWidth = themeNode.get_border_width(side);
            bodyColor = themeNode.get_background_color();
        }

        // Define the radius as an arbitrary size, but keep large enough to account
        // for the drawing of the border.
        radius = Math.max(width/22, borderWidth/2);
        padding = 0; // distance from the margin
        spacing = radius + borderWidth; // separation between the dots

        return [borderColor, borderWidth, bodyColor, radius, padding, spacing];
    },

    _drawCircles: function() {

        let area = this._dots;
        let side =  Utils.getPosition(this._settings);

        let [borderColor, borderWidth, bodyColor, radius, padding, spacing] = this._getDotsStyle();

        let [width, height] = area.get_surface_size();
        let cr = area.get_context();

        // Draw the required numbers of dots

        let n = this._nWindows;

        cr.setLineWidth(borderWidth);
        Clutter.cairo_set_source_color(cr, borderColor);

        switch (side) {
        case St.Side.TOP:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, padding);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, radius + borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.BOTTOM:
            cr.translate((width - (2*n)*radius - (n-1)*spacing)/2, height - padding);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc((2*i+1)*radius + i*spacing, -radius - borderWidth/2, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.LEFT:
            cr.translate(padding, (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc(radius + borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;

        case St.Side.RIGHT:
            cr.translate(width - padding , (height - (2*n)*radius - (n-1)*spacing)/2);
            for (let i = 0; i < n; i++) {
                cr.newSubPath();
                cr.arc(-radius - borderWidth/2, (2*i+1)*radius + i*spacing, radius, 0, 2*Math.PI);
            }
            break;
        }

        cr.strokePreserve();

        Clutter.cairo_set_source_color(cr, bodyColor);
        cr.fill();
        cr.$dispose();
    },

    destroy: function() {
        this.parent();
        this._dots.destroy();
    }

});

// We need an icons theme object, this is the only way I managed to get
// pixel buffers that can be used for calculating the backlight color
let themeLoader = null;

// Global icon cache. Used for Unity7 styling.
let iconCacheMap = new Map();
// Max number of items to store
// We don't expect to ever reach this number, but let's put an hard limit to avoid
// even the remote possibility of the cached items to grow indefinitely.
const MAX_CACHED_ITEMS = 1000;
// When the size exceed it, the oldest 'n' ones are deleted
const  BATCH_SIZE_TO_DELETE = 50;
// The icon size used to extract the dominant color
const DOMINANT_COLOR_ICON_SIZE = 64;

const GlossyColoredBacklitIndicator = new Lang.Class({

    Name: 'DashToDock.GlossyColoredBacklitIndicator',
    Extends: RunningDotsIndicator,

    _init: function(source, settings) {

        this.parent(source, settings);

        // Apply glossy background
        // TODO: move to enable/disableBacklit to apply itonly to the running apps?
        // TODO: move to css class for theming support
        let path = imports.misc.extensionUtils.getCurrentExtension().path;
        let backgroundStyle = 'background-image: url(\'' + path + '/media/glossy.svg\');' +
                              'background-size: contain;';
        this._source._iconContainer.get_children()[1].set_style(backgroundStyle);
    },

    update: function() {
        this.parent();

        // Enable / Disable the backlight of running apps
        if (this._isRunning) {
            this._enableBacklight();

        // TODO DO we need this!?
        // Repaint the dots to make sure they have the correct color
        if (this._dots)
            this._dots.queue_repaint();
        } else {
            this._disableBacklight();
        }
    },

    _getDotsStyle: function() {

        let [borderColor, borderWidth, bodyColor, radius, padding, spacing] =  this.parent()

        // TODO: duplicated in enableBacklight but cached...
        let colorPallete = this._calculateColorPalette();

        // SLightly adjust the styling
        padding = 1.45;
        borderWidth = 2;

        if (colorPallete !== null) {
            borderColor = Clutter.color_from_string(colorPallete.lighter)[1] ;
            bodyColor = Clutter.color_from_string(colorPallete.darker)[1];
        } else {
            // Fallback
            borderColor = Clutter.color_from_string('white')[1];
            bodyColor = Clutter.color_from_string('gray')[1];
        }

        return [borderColor, borderWidth, bodyColor, radius, padding, spacing];

    },

    _enableBacklight: function() {
        let colorPallete = this._calculateColorPalette();

        // Fallback
        if (colorPallete === null) {
            this._source._iconContainer.set_style(
                'border-radius: 5px;' +
                'background-gradient-direction: vertical;' +
                'background-gradient-start: #e0e0e0;' +
                'background-gradient-end: darkgray;'
            );

           return;
        }

        this._source._iconContainer.set_style(
            'border-radius: 5px;' +
            'background-gradient-direction: vertical;' +
            'background-gradient-start: ' + colorPallete.original + ';' +
            'background-gradient-end: ' +  colorPallete.darker + ';'
        );

    },

    _disableBacklight: function() {
        this._source._iconContainer.set_style(null);
    },

    /**
     * Try to get the pixel buffer for the current icon, if not fail gracefully
     */
    _getIconPixBuf: function() {
        let iconTexture = this._source.app.create_icon_texture(16);

        if (themeLoader === null) {
            let ifaceSettings = new Gio.Settings({ schema: "org.gnome.desktop.interface" });

            themeLoader = new Gtk.IconTheme(),
            themeLoader.set_custom_theme(ifaceSettings.get_string('icon-theme')); // Make sure the correct theme is loaded
        }

        // Unable to load the icon texture, use fallback
        if (iconTexture instanceof St.Icon === false) {
            return null;
        }

        iconTexture = iconTexture.get_gicon();

        // Unable to load the icon texture, use fallback
        if (iconTexture === null) {
            return null;
        }

        if (iconTexture instanceof Gio.FileIcon) {
            // Use GdkPixBuf to load the pixel buffer from the provided file path
            return GdkPixbuf.Pixbuf.new_from_file(iconTexture.get_file().get_path());
        }

        // Get the pixel buffer from the icon theme
        return themeLoader.load_icon(iconTexture.get_names()[0], DOMINANT_COLOR_ICON_SIZE, 0);
    },

    /**
     * The backlight color choosing algorithm was mostly ported to javascript from the
     * Unity7 C++ source of Canonicals:
     * http://bazaar.launchpad.net/~unity-team/unity/trunk/view/head:/launcher/LauncherIcon.cpp
     * so it more or less works the same way.
     */
    _calculateColorPalette: function() {
        if (iconCacheMap.get(this._source.app.get_id())) {
            // We already know the answer
            return iconCacheMap.get(this._source.app.get_id());
        }

        let pixBuf = this._getIconPixBuf();
        if (pixBuf == null)
            return null;

        let pixels = pixBuf.get_pixels(),
            offset = 0;

        let total  = 0,
            rTotal = 0,
            gTotal = 0,
            bTotal = 0;

        let resample_y = 1,
            resample_x = 1;

        // Resampling of large icons
        // We resample icons larger than twice the desired size, as the resampling
        // to a size s
        // DOMINANT_COLOR_ICON_SIZE < s < 2*DOMINANT_COLOR_ICON_SIZE,
        // most of the case exactly DOMINANT_COLOR_ICON_SIZE as the icon size is tipycally
        // a multiple of it.
        let width = pixBuf.get_width();
        let height = pixBuf.get_height();

        // Resample
        if (height >= 2* DOMINANT_COLOR_ICON_SIZE)
            resample_y = Math.floor(height/DOMINANT_COLOR_ICON_SIZE);

        if (width >= 2* DOMINANT_COLOR_ICON_SIZE)
            resample_x = Math.floor(width/DOMINANT_COLOR_ICON_SIZE);

        if (resample_x !==1 || resample_y !== 1)
            pixels = this._resamplePixels(pixels, resample_x, resample_y);

        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        let limit = pixels.length;
        for (let offset = 0; offset < limit; offset+=4) {
            let r = pixels[offset],
                g = pixels[offset + 1],
                b = pixels[offset + 2],
                a = pixels[offset + 3];

            let saturation = (Math.max(r,g, b) - Math.min(r,g, b));
            let relevance  = 0.1 * 255 * 255 + 0.9 * a * saturation;

            rTotal += r * relevance;
            gTotal += g * relevance;
            bTotal += b * relevance;

            total += relevance;
        }

        total = total * 255;

        let r = rTotal / total,
            g = gTotal / total,
            b = bTotal / total;

        let hsv = Utils.ColorUtils.RGBtoHSV(r * 255, g * 255, b * 255);

        if (hsv.s > 0.15)
            hsv.s = 0.65;
        hsv.v = 0.90;

        let rgb = Utils.ColorUtils.HSVtoRGB(hsv.h, hsv.s, hsv.v);

        // Cache the result.
        let backgroundColor = {
            lighter:  Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0.2),
            original: Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, 0),
            darker:   Utils.ColorUtils.ColorLuminance(rgb.r, rgb.g, rgb.b, -0.5)
        };

        if (iconCacheMap.size >= MAX_CACHED_ITEMS) {
            //delete oldest cached values (which are in order of insertions)
            let ctr=0;
            for (let key of iconCacheMap.keys()) {
                if (++ctr > BATCH_SIZE_TO_DELETE)
                    break;
                iconCacheMap.delete(key);
            }
        }

        iconCacheMap.set(this._source.app.get_id(), backgroundColor);

        return backgroundColor;
    },

    /**
     * Downsample large icons before scanning for the backlight color to
     * improve performance.
     *
     * @param pixBuf
     * @param pixels
     * @param resampleX
     * @param resampleY
     *
     * @return [];
     */
    _resamplePixels: function (pixels, resampleX, resampleY) {
        let resampledPixels = [];
        // computing the limit outside the for (where it would be repeated at each iteration)
        // for performance reasons
        let limit = pixels.length / (resampleX * resampleY) / 4;
        for (let i = 0; i < limit; i++) {
            let pixel = i * resampleX * resampleY;

            resampledPixels.push(pixels[pixel * 4]);
            resampledPixels.push(pixels[pixel * 4 + 1]);
            resampledPixels.push(pixels[pixel * 4 + 2]);
            resampledPixels.push(pixels[pixel * 4 + 3]);
        }

        return resampledPixels;
    },

    destroy: function() {
        this._disableBacklight();
        // Remove glossy background if the children still exists
        if (this._source._iconContainer.get_children().length > 1)
            this._source._iconContainer.get_children()[1].set_style(null);

        this.parent();
    }
});

