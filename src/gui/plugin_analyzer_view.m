#import "gui/plugin_analyzer_view.h"

#include <math.h>

#import "gui/plugin_gui_shared.h"

static NSString* FwakAnalyzerTitleForPlugin(const FwakPlugin* plugin)
{
    if (plugin && fwak_has_analyzer_zones(plugin)) {
        return FwakSupportsFrequencyEditor() ? @"Drive Band Map" : @"Band Activity";
    }
    return FWAK_PLUGIN_IS_INSTRUMENT ? @"Performance Trace" : @"Signal Trace";
}

static NSString* FwakAnalyzerBadgeTextForMeter(const FwakPlugin* plugin, NSUInteger meterIndex)
{
    if (!plugin || meterIndex >= FWAK_METER_COUNT) {
        return nil;
    }

    const FwakMeterManifestItem* manifest = &FWAK_METER_MANIFEST[meterIndex];
    return [NSString stringWithFormat:@"%s %.1f", manifest->label, FwakMeterValueForId(plugin, manifest->id)];
}

static CGFloat FwakClampUnit(CGFloat value)
{
    return fmax(0.0, fmin(1.0, value));
}

static CGFloat FwakAmplitudeY(CGFloat centerY, CGFloat halfHeight, float sampleValue)
{
    const CGFloat clamped = fmax(-1.0, fmin(1.0, (CGFloat)sampleValue));
    return centerY + clamped * halfHeight;
}

static CGFloat FwakDbAmplitude(CGFloat dbValue)
{
    return pow(10.0, dbValue / 20.0);
}

static float FwakBandSaturationValue(const FwakAnalyzerSnapshot* snapshot, NSUInteger bandIndex, NSUInteger historyIndex)
{
    switch (bandIndex) {
    case 0:
        return snapshot->driveLowSaturation[historyIndex];
    case 1:
        return snapshot->driveMidSaturation[historyIndex];
    default:
        return snapshot->driveHighSaturation[historyIndex];
    }
}

static CGFloat FwakClampCoordinate(CGFloat value, CGFloat minValue, CGFloat maxValue)
{
    return fmax(minValue, fmin(maxValue, value));
}

static double FwakClampDouble(double value, double minValue, double maxValue)
{
    return fmax(minValue, fmin(maxValue, value));
}

static NSRect FwakAnalyzerPanelRect(NSRect bounds)
{
    return NSInsetRect(bounds, 2.0, 2.0);
}

static NSRect FwakAnalyzerFrequencyRect(NSRect panelRect)
{
    return NSMakeRect(NSMinX(panelRect) + 18.0, NSMaxY(panelRect) - 96.0, panelRect.size.width - 82.0, 56.0);
}

static NSRect FwakAnalyzerPlotRect(NSRect panelRect, NSRect frequencyRect)
{
    return NSMakeRect(NSMinX(panelRect) + 18.0, NSMinY(panelRect) + 20.0, panelRect.size.width - 82.0,
                      NSMinY(frequencyRect) - NSMinY(panelRect) - 34.0);
}

static CGFloat FwakNormalizedLogFrequency(double frequency)
{
    const double minHz = 60.0;
    const double maxHz = 18000.0;
    const double clamped = FwakClampDouble(frequency, minHz, maxHz);
    return (CGFloat)((log10(clamped) - log10(minHz)) / (log10(maxHz) - log10(minHz)));
}

static CGFloat FwakFrequencyXForValue(NSRect rect, double frequency)
{
    return NSMinX(rect) + FwakNormalizedLogFrequency(frequency) * rect.size.width;
}

static double FwakFrequencyValueForX(NSRect rect, CGFloat x)
{
    const double minHz = 60.0;
    const double maxHz = 18000.0;
    const CGFloat clampedX = FwakClampCoordinate(x, NSMinX(rect), NSMaxX(rect));
    const double unit = (clampedX - NSMinX(rect)) / fmax(rect.size.width, 1.0);
    return pow(10.0, log10(minHz) + unit * (log10(maxHz) - log10(minHz)));
}

static NSString* FwakFrequencyDisplayString(double frequency)
{
    if (frequency >= 1000.0) {
        const double kiloHz = frequency / 1000.0;
        return kiloHz >= 10.0 ? [NSString stringWithFormat:@"%.0fk", kiloHz] : [NSString stringWithFormat:@"%.1fk", kiloHz];
    }
    return [NSString stringWithFormat:@"%.0f", frequency];
}

@implementation FWAK_ANALYZER_VIEW_CLASS

- (instancetype)initWithPlugin:(FwakPlugin*)plugin
{
    self = [super initWithFrame:NSZeroRect];
    if (!self) {
        return nil;
    }

    _plugin = plugin;
    _activeHandleIndex = -1;
    [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    [self setWantsLayer:YES];
    return self;
}

- (BOOL)acceptsFirstMouse:(NSEvent*)event
{
    (void)event;
    return YES;
}

- (NSRect)frequencyRect
{
    return FwakAnalyzerFrequencyRect(FwakAnalyzerPanelRect(self.bounds));
}

- (NSInteger)handleIndexAtPoint:(NSPoint)point
{
    const int lowSplitIndex = FwakDriveLowSplitParameterIndex();
    const int highSplitIndex = FwakDriveHighSplitParameterIndex();
    if (lowSplitIndex < 0 || highSplitIndex < 0) {
        return -1;
    }

    const NSRect frequencyRect = [self frequencyRect];
    const CGFloat lowSplitX =
        FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[lowSplitIndex].id));
    const CGFloat highSplitX =
        FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[highSplitIndex].id));
    const CGFloat distanceToLow = fabs(point.x - lowSplitX);
    const CGFloat distanceToHigh = fabs(point.x - highSplitX);
    const BOOL insideY = point.y >= NSMinY(frequencyRect) - 10.0 && point.y <= NSMaxY(frequencyRect) + 12.0;

    if (!insideY) {
        return -1;
    }
    if (distanceToLow <= 10.0 || distanceToHigh <= 10.0) {
        return distanceToLow <= distanceToHigh ? 0 : 1;
    }
    return -1;
}

- (void)resetCursorRects
{
    [super resetCursorRects];

    const int lowSplitIndex = FwakDriveLowSplitParameterIndex();
    const int highSplitIndex = FwakDriveHighSplitParameterIndex();
    if (!_plugin || lowSplitIndex < 0 || highSplitIndex < 0) {
        return;
    }

    const NSRect frequencyRect = [self frequencyRect];
    const CGFloat lowSplitX =
        FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[lowSplitIndex].id));
    const CGFloat highSplitX =
        FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[highSplitIndex].id));

    [self addCursorRect:NSInsetRect(NSMakeRect(lowSplitX - 8.0, NSMinY(frequencyRect) - 8.0, 16.0, frequencyRect.size.height + 16.0), -2.0, 0.0)
                 cursor:[NSCursor resizeLeftRightCursor]];
    [self addCursorRect:NSInsetRect(NSMakeRect(highSplitX - 8.0, NSMinY(frequencyRect) - 8.0, 16.0, frequencyRect.size.height + 16.0), -2.0, 0.0)
                 cursor:[NSCursor resizeLeftRightCursor]];
}

- (void)updateSplitParameterForHandle:(NSInteger)handleIndex point:(NSPoint)point
{
    const int lowSplitIndex = FwakDriveLowSplitParameterIndex();
    const int highSplitIndex = FwakDriveHighSplitParameterIndex();
    if (!_plugin || lowSplitIndex < 0 || highSplitIndex < 0) {
        return;
    }

    const NSRect frequencyRect = [self frequencyRect];
    const CGFloat clampedX = FwakClampCoordinate(point.x, NSMinX(frequencyRect), NSMaxX(frequencyRect));
    const double proposedFrequency = FwakFrequencyValueForX(frequencyRect, clampedX);
    const double currentLow = cplug_getParameterValue(_plugin, gFwakParameters[lowSplitIndex].id);
    const double currentHigh = cplug_getParameterValue(_plugin, gFwakParameters[highSplitIndex].id);

    if (handleIndex == 0) {
        const double nextLow = FwakClampDouble(proposedFrequency,
                                               gFwakParameters[lowSplitIndex].minValue,
                                               currentHigh - 40.0);
        fwak_update_parameter_from_ui(_plugin, gFwakParameters[lowSplitIndex].id, nextLow);
    } else if (handleIndex == 1) {
        const double nextHigh = FwakClampDouble(proposedFrequency,
                                                currentLow + 40.0,
                                                gFwakParameters[highSplitIndex].maxValue);
        fwak_update_parameter_from_ui(_plugin, gFwakParameters[highSplitIndex].id, nextHigh);
    }

    [self.window invalidateCursorRectsForView:self];
    [self setNeedsDisplay:YES];
}

- (void)mouseDown:(NSEvent*)event
{
    const int lowSplitIndex = FwakDriveLowSplitParameterIndex();
    const int highSplitIndex = FwakDriveHighSplitParameterIndex();
    if (!_plugin || lowSplitIndex < 0 || highSplitIndex < 0) {
        [super mouseDown:event];
        return;
    }

    const NSPoint downPoint = [self convertPoint:[event locationInWindow] fromView:nil];
    _activeHandleIndex = [self handleIndexAtPoint:downPoint];
    if (_activeHandleIndex < 0) {
        [super mouseDown:event];
        return;
    }

    const uint32_t paramId = gFwakParameters[_activeHandleIndex == 0 ? lowSplitIndex : highSplitIndex].id;
    fwak_begin_parameter_edit(_plugin, paramId);
    [self updateSplitParameterForHandle:_activeHandleIndex point:downPoint];

    BOOL keepTracking = YES;
    while (keepTracking) {
        NSEvent* nextEvent =
            [self.window nextEventMatchingMask:(NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp)];
        const NSPoint nextPoint = [self convertPoint:[nextEvent locationInWindow] fromView:nil];
        [self updateSplitParameterForHandle:_activeHandleIndex point:nextPoint];
        keepTracking = nextEvent.type != NSEventTypeLeftMouseUp;
    }

    fwak_end_parameter_edit(_plugin, paramId);
    _activeHandleIndex = -1;
}

- (void)drawRoundedBadgeInRect:(NSRect)rect text:(NSString*)text fillColor:(NSColor*)fillColor
{
    NSBezierPath* badge = [NSBezierPath bezierPathWithRoundedRect:rect xRadius:8.0 yRadius:8.0];
    [fillColor setFill];
    [badge fill];

    NSMutableParagraphStyle* style = [[[NSMutableParagraphStyle alloc] init] autorelease];
    [style setAlignment:NSTextAlignmentCenter];
    NSDictionary* attributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:11.0 weight:NSFontWeightSemibold],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.98 alpha:1.0],
        NSParagraphStyleAttributeName: style
    };
    [text drawInRect:NSInsetRect(rect, 4.0, 3.0) withAttributes:attributes];
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void)dirtyRect;

    const NSRect bounds = self.bounds;
    const NSRect panelRect = FwakAnalyzerPanelRect(bounds);
    const NSRect frequencyRect = FwakAnalyzerFrequencyRect(panelRect);
    const NSRect plotRect = FwakAnalyzerPlotRect(panelRect, frequencyRect);
    const CGFloat centerY = NSMidY(plotRect);
    const CGFloat halfHeight = plotRect.size.height * 0.47;
    const CGFloat maxGrDb = 18.0;
    NSColor* bandColors[3] = {
        [NSColor colorWithCalibratedRed:0.95 green:0.58 blue:0.24 alpha:1.0],
        [NSColor colorWithCalibratedRed:0.95 green:0.42 blue:0.32 alpha:1.0],
        [NSColor colorWithCalibratedRed:0.90 green:0.28 blue:0.46 alpha:1.0]
    };
    NSString* bandLabels[3] = {@"Low", @"Mid", @"High"};

    NSBezierPath* panelPath = [NSBezierPath bezierPathWithRoundedRect:panelRect xRadius:18.0 yRadius:18.0];
    NSGradient* gradient = [[[NSGradient alloc] initWithColorsAndLocations:
        [NSColor colorWithCalibratedRed:0.08 green:0.09 blue:0.13 alpha:1.0], 0.0,
        [NSColor colorWithCalibratedRed:0.10 green:0.13 blue:0.19 alpha:1.0], 0.52,
        [NSColor colorWithCalibratedRed:0.07 green:0.08 blue:0.12 alpha:1.0], 1.0,
        nil] autorelease];
    [gradient drawInBezierPath:panelPath angle:-90.0];
    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.08] setStroke];
    [panelPath setLineWidth:1.0];
    [panelPath stroke];

    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.05] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:frequencyRect xRadius:12.0 yRadius:12.0] fill];
    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.08] setStroke];
    {
        NSBezierPath* frequencyBorder = [NSBezierPath bezierPathWithRoundedRect:frequencyRect xRadius:12.0 yRadius:12.0];
        [frequencyBorder setLineWidth:1.0];
        [frequencyBorder stroke];
    }

    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.05] setStroke];
    {
        const CGFloat dbStops[] = {0.0, -6.0, -12.0, -18.0, -24.0};
        NSUInteger stopIndex = 0;
        for (; stopIndex < sizeof(dbStops) / sizeof(dbStops[0]); ++stopIndex) {
            const CGFloat amplitude = FwakDbAmplitude(dbStops[stopIndex]);
            const CGFloat upperY = centerY + amplitude * halfHeight;
            const CGFloat lowerY = centerY - amplitude * halfHeight;
            NSBezierPath* upper = [NSBezierPath bezierPath];
            [upper moveToPoint:NSMakePoint(NSMinX(plotRect), upperY)];
            [upper lineToPoint:NSMakePoint(NSMaxX(plotRect), upperY)];
            [upper stroke];

            if (stopIndex > 0) {
                NSBezierPath* lower = [NSBezierPath bezierPath];
                [lower moveToPoint:NSMakePoint(NSMinX(plotRect), lowerY)];
                [lower lineToPoint:NSMakePoint(NSMaxX(plotRect), lowerY)];
                [lower stroke];
            }
        }
    }

    [[NSColor colorWithCalibratedRed:0.83 green:0.22 blue:0.22 alpha:0.9] setStroke];
    {
        NSBezierPath* ceilingLine = [NSBezierPath bezierPath];
        [ceilingLine moveToPoint:NSMakePoint(NSMinX(plotRect), centerY + halfHeight)];
        [ceilingLine lineToPoint:NSMakePoint(NSMaxX(plotRect), centerY + halfHeight)];
        [ceilingLine setLineWidth:1.2];
        [ceilingLine stroke];
    }

    {
        NSDictionary* heatTitleAttributes = @{
            NSFontAttributeName: [NSFont systemFontOfSize:10.0 weight:NSFontWeightSemibold],
            NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.84 alpha:0.8]
        };
        [FwakAnalyzerTitleForPlugin(_plugin) drawAtPoint:NSMakePoint(NSMinX(frequencyRect), NSMaxY(frequencyRect) + 4.0)
                                          withAttributes:heatTitleAttributes];
    }

    if (_plugin) {
        FwakAnalyzerSnapshot snapshot;
        fwak_copy_analyzer_snapshot(_plugin, &snapshot);

        NSBezierPath* inputPath = [NSBezierPath bezierPath];
        NSBezierPath* outputPath = [NSBezierPath bezierPath];
        NSBezierPath* gainReductionPath = [NSBezierPath bezierPath];
        const NSUInteger currentHistoryIndex = (snapshot.writeIndex + FWAK_ANALYZER_HISTORY_LENGTH - 1u) % FWAK_ANALYZER_HISTORY_LENGTH;
        const int driveLowSplitIndex = FwakDriveLowSplitParameterIndex();
        const int driveHighSplitIndex = FwakDriveHighSplitParameterIndex();
        const int driveFocusIndex = FwakDriveFocusParameterIndex();
        const BOOL supportsFrequencyEditor = driveLowSplitIndex >= 0 && driveHighSplitIndex >= 0;
        const BOOL showsBandMap = fwak_has_analyzer_zones(_plugin);
        const CGFloat lowSplitX =
            supportsFrequencyEditor
                ? FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[driveLowSplitIndex].id))
                : NSMinX(frequencyRect) + frequencyRect.size.width * 0.34;
        const CGFloat highSplitX =
            supportsFrequencyEditor
                ? FwakFrequencyXForValue(frequencyRect, cplug_getParameterValue(_plugin, gFwakParameters[driveHighSplitIndex].id))
                : NSMinX(frequencyRect) + frequencyRect.size.width * 0.68;
        const CGFloat bandEdges[4] = {NSMinX(frequencyRect), lowSplitX, highSplitX, NSMaxX(frequencyRect)};
        const double focusValue =
            driveFocusIndex >= 0 ? cplug_getParameterValue(_plugin, gFwakParameters[driveFocusIndex].id) : 0.0;
        const NSInteger selectedBandIndex = driveFocusIndex >= 0 ? (NSInteger)lrint(focusValue) - 1 : -1;
        NSUInteger i = 0;

        if (showsBandMap) {
            NSUInteger bandIndex = 0;
            for (; bandIndex < 3; ++bandIndex) {
                const CGFloat bandMinX = bandEdges[bandIndex];
                const CGFloat bandMaxX = bandEdges[bandIndex + 1];
                const CGFloat bandWidth = bandMaxX - bandMinX;
                const CGFloat saturation = FwakClampUnit(FwakBandSaturationValue(&snapshot, bandIndex, currentHistoryIndex));
                const NSRect bandRect = NSMakeRect(bandMinX, NSMinY(frequencyRect), bandWidth, frequencyRect.size.height);
                const CGFloat glowAlpha = (supportsFrequencyEditor ? 0.12 : 0.05) + saturation * (supportsFrequencyEditor ? 0.46 : 0.34);
                [[bandColors[bandIndex] colorWithAlphaComponent:glowAlpha] setFill];
                NSRectFillUsingOperation(bandRect, NSCompositingOperationSourceOver);

                if (supportsFrequencyEditor && (NSInteger)bandIndex == selectedBandIndex) {
                    [[NSColor colorWithCalibratedWhite:1.0 alpha:0.16] setStroke];
                    NSBezierPath* highlight = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(bandRect, 1.0, 1.0) xRadius:10.0 yRadius:10.0];
                    [highlight setLineWidth:1.4];
                    [highlight stroke];
                }

                {
                    const CGFloat levelY = NSMinY(frequencyRect) + saturation * frequencyRect.size.height;
                    NSBezierPath* saturationLine = [NSBezierPath bezierPath];
                    [saturationLine moveToPoint:NSMakePoint(bandMinX + 2.0, levelY)];
                    [saturationLine lineToPoint:NSMakePoint(bandMaxX - 2.0, levelY)];
                    [[bandColors[bandIndex] colorWithAlphaComponent:0.95] setStroke];
                    [saturationLine setLineWidth:2.0];
                    [saturationLine stroke];
                }
            }
        }

        for (; i < FWAK_ANALYZER_HISTORY_LENGTH; ++i) {
            const NSUInteger historyIndex = (snapshot.writeIndex + i) % FWAK_ANALYZER_HISTORY_LENGTH;
            const CGFloat x = NSMinX(plotRect) + ((CGFloat)i / (CGFloat)(FWAK_ANALYZER_HISTORY_LENGTH - 1)) * plotRect.size.width;
            const CGFloat inputUpperY = FwakAmplitudeY(centerY, halfHeight, snapshot.inputMax[historyIndex]);
            const CGFloat outputUpperY = FwakAmplitudeY(centerY, halfHeight, snapshot.outputMax[historyIndex]);
            const CGFloat grUnit = FwakClampUnit(snapshot.gainReductionDb[historyIndex] / maxGrDb);
            const CGFloat grY = NSMaxY(plotRect) - grUnit * plotRect.size.height;

            if (i == 0) {
                [inputPath moveToPoint:NSMakePoint(x, centerY)];
                [outputPath moveToPoint:NSMakePoint(x, centerY)];
                [gainReductionPath moveToPoint:NSMakePoint(x, grY)];
            }

            [inputPath lineToPoint:NSMakePoint(x, inputUpperY)];
            [outputPath lineToPoint:NSMakePoint(x, outputUpperY)];
            [gainReductionPath lineToPoint:NSMakePoint(x, grY)];
        }

        for (i = FWAK_ANALYZER_HISTORY_LENGTH; i-- > 0;) {
            const NSUInteger historyIndex = (snapshot.writeIndex + i) % FWAK_ANALYZER_HISTORY_LENGTH;
            const CGFloat x = NSMinX(plotRect) + ((CGFloat)i / (CGFloat)(FWAK_ANALYZER_HISTORY_LENGTH - 1)) * plotRect.size.width;
            [inputPath lineToPoint:NSMakePoint(x, FwakAmplitudeY(centerY, halfHeight, snapshot.inputMin[historyIndex]))];
            [outputPath lineToPoint:NSMakePoint(x, FwakAmplitudeY(centerY, halfHeight, snapshot.outputMin[historyIndex]))];
        }

        [inputPath closePath];
        [outputPath closePath];

        [[NSColor colorWithCalibratedRed:0.57 green:0.52 blue:0.82 alpha:0.18] setFill];
        [inputPath fill];

        [[NSColor colorWithCalibratedRed:0.71 green:0.79 blue:1.0 alpha:0.52] setFill];
        [outputPath fill];

        [[NSColor colorWithCalibratedRed:0.96 green:0.78 blue:0.38 alpha:0.95] setStroke];
        [gainReductionPath setLineWidth:2.0];
        [gainReductionPath stroke];

        if (showsBandMap) {
            NSDictionary* bandAttributes = @{
                NSFontAttributeName: [NSFont systemFontOfSize:10.0 weight:NSFontWeightSemibold],
                NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.92 alpha:0.94]
            };
            NSUInteger bandIndex = 0;
            for (; bandIndex < 3; ++bandIndex) {
                const CGFloat bandMinX = bandEdges[bandIndex];
                const CGFloat bandMaxX = bandEdges[bandIndex + 1];
                const CGFloat bandWidth = bandMaxX - bandMinX;
                [bandLabels[bandIndex] drawInRect:NSMakeRect(bandMinX + 8.0, NSMinY(frequencyRect) + 6.0, fmax(42.0, bandWidth - 16.0), 14.0)
                                   withAttributes:bandAttributes];
            }
        }

        if (supportsFrequencyEditor) {
            const CGFloat handleXs[2] = {lowSplitX, highSplitX};
            const int handleParameters[2] = {driveLowSplitIndex, driveHighSplitIndex};
            int handleIndex = 0;
            for (; handleIndex < 2; ++handleIndex) {
                const CGFloat handleX = handleXs[handleIndex];
                NSBezierPath* line = [NSBezierPath bezierPath];
                [line moveToPoint:NSMakePoint(handleX, NSMinY(frequencyRect) - 8.0)];
                [line lineToPoint:NSMakePoint(handleX, NSMaxY(frequencyRect) + 4.0)];
                [[NSColor colorWithCalibratedWhite:1.0 alpha:0.32] setStroke];
                [line setLineWidth:1.2];
                [line stroke];

                NSBezierPath* knob = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(handleX - 6.0, NSMaxY(frequencyRect) - 4.0, 12.0, 12.0)];
                [[NSColor colorWithCalibratedWhite:0.12 alpha:0.95] setFill];
                [knob fill];
                [[NSColor colorWithCalibratedWhite:1.0 alpha:0.82] setStroke];
                [knob setLineWidth:1.1];
                [knob stroke];

                {
                    NSString* valueText = FwakParameterDisplayString(_plugin, handleParameters[handleIndex]);
                    NSRect badgeRect = NSMakeRect(handleX - 34.0, NSMaxY(frequencyRect) - 18.0, 68.0, 14.0);
                    [self drawRoundedBadgeInRect:badgeRect text:valueText fillColor:[NSColor colorWithCalibratedWhite:0.16 alpha:0.94]];
                }
            }
        }
    }

    {
        NSDictionary* axisAttributes = @{
            NSFontAttributeName: [NSFont systemFontOfSize:10.0 weight:NSFontWeightMedium],
            NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.82 alpha:0.72]
        };
        const CGFloat dbStops[] = {0.0, -6.0, -12.0, -18.0, -24.0};
        NSUInteger stopIndex = 0;
        for (; stopIndex < sizeof(dbStops) / sizeof(dbStops[0]); ++stopIndex) {
            const CGFloat amplitude = FwakDbAmplitude(dbStops[stopIndex]);
            const CGFloat y = centerY + amplitude * halfHeight - 7.0;
            [[NSString stringWithFormat:@"%.0f dB", dbStops[stopIndex]] drawAtPoint:NSMakePoint(NSMaxX(plotRect) + 10.0, y)
                                                                     withAttributes:axisAttributes];
        }
    }

    {
        NSDictionary* bandAttributes = @{
            NSFontAttributeName: [NSFont systemFontOfSize:10.0 weight:NSFontWeightSemibold],
            NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.82 alpha:0.78]
        };
        const double frequencyTicks[] = {60.0, 100.0, 300.0, 600.0, 1000.0, 3000.0, 6000.0, 10000.0};
        NSUInteger tickIndex = 0;
        for (; tickIndex < sizeof(frequencyTicks) / sizeof(frequencyTicks[0]); ++tickIndex) {
            const CGFloat tickX = FwakFrequencyXForValue(frequencyRect, frequencyTicks[tickIndex]);
            NSBezierPath* tickPath = [NSBezierPath bezierPath];
            [tickPath moveToPoint:NSMakePoint(tickX, NSMinY(frequencyRect) - 3.0)];
            [tickPath lineToPoint:NSMakePoint(tickX, NSMinY(frequencyRect) + 4.0)];
            [[NSColor colorWithCalibratedWhite:1.0 alpha:0.18] setStroke];
            [tickPath setLineWidth:1.0];
            [tickPath stroke];

            [FwakFrequencyDisplayString(frequencyTicks[tickIndex])
                drawAtPoint:NSMakePoint(tickX - 10.0, NSMinY(frequencyRect) - 18.0)
                withAttributes:bandAttributes];
        }
    }

    if (_plugin && FwakDriveTargetParameterIndex() >= 0 && FwakDriveFocusParameterIndex() >= 0) {
        [self drawRoundedBadgeInRect:NSMakeRect(NSMaxX(frequencyRect) - 146.0, NSMaxY(frequencyRect) + 2.0, 66.0, 18.0)
                                text:FwakParameterDisplayString(_plugin, FwakDriveTargetParameterIndex())
                           fillColor:[NSColor colorWithCalibratedRed:0.18 green:0.39 blue:0.61 alpha:0.92]];
        [self drawRoundedBadgeInRect:NSMakeRect(NSMaxX(frequencyRect) - 74.0, NSMaxY(frequencyRect) + 2.0, 66.0, 18.0)
                                text:FwakParameterDisplayString(_plugin, FwakDriveFocusParameterIndex())
                           fillColor:[NSColor colorWithCalibratedRed:0.52 green:0.27 blue:0.17 alpha:0.94]];
    }

    {
        NSColor* badgeColors[] = {
            [NSColor colorWithCalibratedRed:0.36 green:0.42 blue:0.74 alpha:0.92],
            [NSColor colorWithCalibratedRed:0.48 green:0.56 blue:0.92 alpha:0.92],
            [NSColor colorWithCalibratedRed:0.80 green:0.55 blue:0.24 alpha:0.96]
        };
        const BOOL showsDriveBadges = _plugin && FwakDriveTargetParameterIndex() >= 0 && FwakDriveFocusParameterIndex() >= 0;
        const NSUInteger badgeCount = FWAK_METER_COUNT < 3 ? (NSUInteger)FWAK_METER_COUNT : 3u;
        if (badgeCount > 0u) {
            const CGFloat badgeGap = 8.0;
            const CGFloat reservedRightWidth = showsDriveBadges ? 160.0 : 0.0;
            const CGFloat badgeWidth =
                fmin(154.0, (frequencyRect.size.width - reservedRightWidth - badgeGap * (CGFloat)(badgeCount - 1u)) / (CGFloat)badgeCount);
            NSUInteger badgeIndex = 0;
            for (; badgeIndex < badgeCount; ++badgeIndex) {
                NSString* badgeText = FwakAnalyzerBadgeTextForMeter(_plugin, badgeIndex);
                if (!badgeText) {
                    continue;
                }
                [self drawRoundedBadgeInRect:NSMakeRect(NSMinX(panelRect) + 18.0 + (badgeWidth + badgeGap) * (CGFloat)badgeIndex,
                                                        NSMaxY(panelRect) - 34.0,
                                                        badgeWidth,
                                                        20.0)
                                        text:badgeText
                                   fillColor:badgeColors[badgeIndex]];
            }
        } else {
            [self drawRoundedBadgeInRect:NSMakeRect(NSMinX(panelRect) + 18.0, NSMaxY(panelRect) - 34.0, 92.0, 20.0)
                                    text:[NSString stringWithFormat:@"In %.1f dB", fwak_get_meter_input_peak_db(_plugin)]
                               fillColor:[NSColor colorWithCalibratedRed:0.36 green:0.42 blue:0.74 alpha:0.92]];
            [self drawRoundedBadgeInRect:NSMakeRect(NSMinX(panelRect) + 116.0, NSMaxY(panelRect) - 34.0, 102.0, 20.0)
                                    text:[NSString stringWithFormat:@"Out %.1f dB", fwak_get_meter_output_peak_db(_plugin)]
                               fillColor:[NSColor colorWithCalibratedRed:0.48 green:0.56 blue:0.92 alpha:0.92]];
            [self drawRoundedBadgeInRect:NSMakeRect(NSMinX(panelRect) + 224.0, NSMaxY(panelRect) - 34.0, 92.0, 20.0)
                                    text:[NSString stringWithFormat:@"GR %.1f dB", fwak_get_meter_gain_reduction_db(_plugin)]
                               fillColor:[NSColor colorWithCalibratedRed:0.80 green:0.55 blue:0.24 alpha:0.96]];
        }
    }
}

@end
