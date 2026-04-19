#import <AppKit/AppKit.h>
#import <AudioToolbox/AUCocoaUIView.h>
#import <AudioToolbox/AudioUnit.h>

#include <math.h>
#include <string.h>

#include "plugin_core.h"

@interface FWAK_PLUGIN_VIEW_CLASS : NSView
{
@private
    FwakPlugin* _plugin;
    NSView* _analyzerView;
    NSTextField* _titleLabel;
    NSTextField* _statusLabel;
    NSTextField* _nameLabels[FWAK_PARAMETER_COUNT];
    NSControl* _controls[FWAK_PARAMETER_COUNT];
    NSTextField* _valueLabels[FWAK_PARAMETER_COUNT];
    NSTextField* _meterLabels[FWAK_METER_COUNT];
    NSLevelIndicator* _meterViews[FWAK_METER_COUNT];
    NSTextField* _meterValues[FWAK_METER_COUNT];
    NSTimer* _meterTimer;
    CGFloat _scaleFactor;
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin;
- (void)syncControlValues;

@end

@interface FWAK_ANALYZER_VIEW_CLASS : NSView
{
@private
    FwakPlugin* _plugin;
    NSInteger _activeHandleIndex;
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin;

@end

@interface FWAK_AUV2_FACTORY_CLASS : NSObject <AUCocoaUIBase>
@end

static NSTextField* FwakMakeLabel(NSString* text, CGFloat fontSize, NSFontWeight weight)
{
    NSTextField* label = [[NSTextField alloc] initWithFrame:NSZeroRect];
    [label setEditable:NO];
    [label setSelectable:NO];
    [label setBordered:NO];
    [label setDrawsBackground:NO];
    [label setStringValue:text];
    [label setFont:[NSFont systemFontOfSize:fontSize weight:weight]];
    [label setTextColor:[NSColor colorWithCalibratedWhite:0.94 alpha:1.0]];
    return label;
}

static NSLevelIndicator* FwakMakeMeter(double maxValue)
{
    NSLevelIndicator* meter = [[NSLevelIndicator alloc] initWithFrame:NSZeroRect];
    [meter setLevelIndicatorStyle:NSContinuousCapacityLevelIndicatorStyle];
    [meter setMinValue:0.0];
    [meter setMaxValue:maxValue];
    [meter setWarningValue:maxValue * 0.75];
    [meter setCriticalValue:maxValue * 0.92];
    [meter setEditable:NO];
    return meter;
}

static int FwakParameterIndexForLabel(const char* label)
{
    return fwak_find_parameter_index_by_label(label);
}

static double FwakMeterValueForId(const FwakPlugin* plugin, const char* meterId)
{
    return fwak_get_meter_value(plugin, meterId);
}

static int FwakDriveTargetParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Target");
    }
    return cachedIndex;
}

static int FwakDriveFocusParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Focus");
    }
    return cachedIndex;
}

static int FwakDriveLowSplitParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Low Split");
    }
    return cachedIndex;
}

static int FwakDriveHighSplitParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive High Split");
    }
    return cachedIndex;
}

static BOOL FwakSupportsFrequencyEditor(void)
{
    return FwakDriveLowSplitParameterIndex() >= 0 && FwakDriveHighSplitParameterIndex() >= 0;
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

static BOOL FwakParameterUsesFrequencyEditor(int parameterIndex)
{
    return parameterIndex == FwakDriveLowSplitParameterIndex() || parameterIndex == FwakDriveHighSplitParameterIndex();
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

static NSInteger FwakVisibleSliderCount(void)
{
    NSInteger sliderCount = 0;
    int orderIndex = 0;
    for (; orderIndex < FWAK_CONTROL_ORDER_COUNT; ++orderIndex) {
        const FwakControlManifestItem* manifest = &FWAK_CONTROL_MANIFEST[FWAK_CONTROL_ORDER[orderIndex]];
        const int parameterIndex = FwakParameterIndexForLabel(manifest->label);
        if (parameterIndex >= 0 && !(gFwakParameters[parameterIndex].flags & CPLUG_FLAG_PARAMETER_IS_BOOL) &&
            !FwakParameterUsesFrequencyEditor(parameterIndex)) {
            sliderCount += 1;
        }
    }
    return sliderCount;
}

static CGFloat FwakMinimumViewHeight(void)
{
    const CGFloat analyzerHeight = 278.0;
    const CGFloat analyzerTop = 78.0;
    const CGFloat controlsTop = analyzerTop + analyzerHeight + 24.0;
    const CGFloat sliderTop = controlsTop + 36.0;
    const CGFloat rowHeight = 54.0;
    const NSInteger sliderRows = (FwakVisibleSliderCount() + 1) / 2;
    const CGFloat sliderBottom = sliderRows > 0 ? sliderTop + (sliderRows - 1) * rowHeight + 66.0 : controlsTop + 24.0;
    const CGFloat meterTop = controlsTop + 6.0;
    const CGFloat meterBottom =
        FWAK_METER_COUNT > 0 ? meterTop + (FWAK_METER_COUNT - 1) * 74.0 + 88.0 : controlsTop + 24.0;
    return fmax(FWAK_UI_DEFAULT_HEIGHT, fmax(sliderBottom, meterBottom));
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

static NSString* FwakParameterDisplayString(FwakPlugin* plugin, int parameterIndex)
{
    if (parameterIndex < 0 || parameterIndex >= FWAK_PARAMETER_COUNT) {
        return @"";
    }
    char buffer[64];
    const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
    cplug_parameterValueToString(plugin, info->id, buffer, sizeof(buffer), cplug_getParameterValue(plugin, info->id));
    return [NSString stringWithUTF8String:buffer];
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
        NSString* title = @"Analyzer";
        if (_plugin && fwak_has_analyzer_zones(_plugin)) {
            title = FwakSupportsFrequencyEditor() ? @"Drive Band Map" : @"Band Activity";
        }
        [title drawAtPoint:NSMakePoint(NSMinX(frequencyRect), NSMaxY(frequencyRect) + 4.0) withAttributes:heatTitleAttributes];
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

@end

@implementation FWAK_PLUGIN_VIEW_CLASS

- (BOOL)isFlipped
{
    return YES;
}

- (void)drawRect:(NSRect)dirtyRect
{
    (void)dirtyRect;

    NSGradient* background = [[[NSGradient alloc] initWithColorsAndLocations:
        [NSColor colorWithCalibratedRed:0.13 green:0.14 blue:0.18 alpha:1.0], 0.0,
        [NSColor colorWithCalibratedRed:0.11 green:0.12 blue:0.16 alpha:1.0], 0.55,
        [NSColor colorWithCalibratedRed:0.09 green:0.10 blue:0.14 alpha:1.0], 1.0,
        nil] autorelease];
    [background drawInRect:self.bounds angle:-90.0];
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin
{
    self = [super initWithFrame:NSMakeRect(0, 0, FWAK_UI_DEFAULT_WIDTH, FwakMinimumViewHeight())];
    if (!self) {
        return nil;
    }

    _plugin = plugin;
    _scaleFactor = 1.0;
    [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    [self setWantsLayer:YES];

    _analyzerView = [[FWAK_ANALYZER_VIEW_CLASS alloc] initWithPlugin:plugin];
    [self addSubview:_analyzerView];

    _titleLabel = FwakMakeLabel(@FWAK_PRODUCT_NAME, 24.0, NSFontWeightSemibold);
    [self addSubview:_titleLabel];

    _statusLabel = FwakMakeLabel(@FWAK_STATUS_TEXT, 11.0, NSFontWeightRegular);
    [_statusLabel setTextColor:[NSColor colorWithCalibratedWhite:0.75 alpha:1.0]];
    [self addSubview:_statusLabel];

    {
        int index = 0;
        for (; index < FWAK_PARAMETER_COUNT; ++index) {
            const FwakParameterInfo* info = &gFwakParameters[index];
            _nameLabels[index] = FwakMakeLabel([NSString stringWithUTF8String:info->label], 12.0, NSFontWeightMedium);
            [self addSubview:_nameLabels[index]];

            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                NSButton* checkbox = [[NSButton alloc] initWithFrame:NSZeroRect];
                [checkbox setButtonType:NSSwitchButton];
                [checkbox setTitle:[NSString stringWithUTF8String:info->label]];
                [checkbox setAttributedTitle:[[[NSAttributedString alloc] initWithString:[NSString stringWithUTF8String:info->label]
                                                                               attributes:@{
                                                                                   NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.92 alpha:1.0],
                                                                                   NSFontAttributeName: [NSFont systemFontOfSize:12.0 weight:NSFontWeightMedium]
                                                                               }] autorelease]];
                [checkbox setTag:index];
                [checkbox setTarget:self];
                [checkbox setAction:@selector(parameterChanged:)];
                _controls[index] = checkbox;
                [self addSubview:checkbox];
            } else {
                NSSlider* slider = [[NSSlider alloc] initWithFrame:NSZeroRect];
                [slider setMinValue:info->minValue];
                [slider setMaxValue:info->maxValue];
                [slider setContinuous:YES];
                if (info->displayKind != 0u) {
                    [slider setNumberOfTickMarks:(NSInteger)(info->maxValue - info->minValue + 1.0)];
                    [slider setAllowsTickMarkValuesOnly:YES];
                }
                [slider setTag:index];
                [slider setTarget:self];
                [slider setAction:@selector(parameterChanged:)];
                _controls[index] = slider;
                [self addSubview:slider];
            }

            _valueLabels[index] = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
            [_valueLabels[index] setAlignment:NSTextAlignmentRight];
            [_valueLabels[index] setTextColor:[NSColor colorWithCalibratedRed:0.95 green:0.81 blue:0.48 alpha:1.0]];
            [self addSubview:_valueLabels[index]];
        }
    }

    {
        int index = 0;
        for (; index < FWAK_METER_COUNT; ++index) {
            _meterLabels[index] = FwakMakeLabel([NSString stringWithUTF8String:FWAK_METER_MANIFEST[index].label], 12.0, NSFontWeightMedium);
            _meterViews[index] = FwakMakeMeter(FWAK_METER_MANIFEST[index].maxValue);
            _meterValues[index] = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
            [_meterValues[index] setAlignment:NSTextAlignmentRight];
            [_meterValues[index] setTextColor:[NSColor colorWithCalibratedRed:0.95 green:0.81 blue:0.48 alpha:1.0]];
            [self addSubview:_meterLabels[index]];
            [self addSubview:_meterViews[index]];
            [self addSubview:_meterValues[index]];
        }
    }

    [self syncControlValues];
    [self updateMeters:nil];
    _meterTimer = [[NSTimer scheduledTimerWithTimeInterval:(1.0 / 30.0)
                                                    target:self
                                                  selector:@selector(updateMeters:)
                                                  userInfo:nil
                                                   repeats:YES] retain];
    return self;
}

- (void)dealloc
{
    [_meterTimer invalidate];
    [_meterTimer release];
    [_analyzerView release];
    [_titleLabel release];
    [_statusLabel release];

    {
        int index = 0;
        for (; index < FWAK_PARAMETER_COUNT; ++index) {
            [_nameLabels[index] release];
            [_controls[index] release];
            [_valueLabels[index] release];
        }
    }

    {
        int index = 0;
        for (; index < FWAK_METER_COUNT; ++index) {
            [_meterLabels[index] release];
            [_meterViews[index] release];
            [_meterValues[index] release];
        }
    }

    [super dealloc];
}

- (NSString*)formattedValueForParameter:(int)parameterIndex
{
    const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
    const double value = cplug_getParameterValue(_plugin, info->id);
    char buffer[64];
    cplug_parameterValueToString(_plugin, info->id, buffer, sizeof(buffer), value);
    return [NSString stringWithUTF8String:buffer];
}

- (void)syncControlValues
{
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        const FwakParameterInfo* info = &gFwakParameters[index];
        const double value = cplug_getParameterValue(_plugin, info->id);
        if (FwakParameterUsesFrequencyEditor(index)) {
            [_controls[index] setHidden:YES];
            [_nameLabels[index] setHidden:YES];
            [_valueLabels[index] setHidden:YES];
            continue;
        }
        if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
            [(NSButton*)_controls[index] setState:(value >= 0.5 ? NSControlStateValueOn : NSControlStateValueOff)];
            [_valueLabels[index] setHidden:YES];
            [_nameLabels[index] setHidden:YES];
            [_controls[index] setHidden:NO];
        } else {
            [(NSSlider*)_controls[index] setDoubleValue:value];
            [_valueLabels[index] setStringValue:[self formattedValueForParameter:index]];
            [_valueLabels[index] setHidden:NO];
            [_nameLabels[index] setHidden:NO];
            [_controls[index] setHidden:NO];
        }
    }
}

- (void)layout
{
    [super layout];

    const CGFloat inset = 24.0;
    const CGFloat boundsWidth = self.bounds.size.width;
    const CGFloat analyzerHeight = 278.0;
    const CGFloat analyzerTop = 78.0;
    const CGFloat controlsTop = analyzerTop + analyzerHeight + 24.0;
    const CGFloat contentWidth = boundsWidth - inset * 2.0;
    const CGFloat meterWidth = 210.0;
    const CGFloat sliderAreaWidth = contentWidth - meterWidth - 28.0;
    const CGFloat meterColumnX = inset + sliderAreaWidth + 28.0;
    const CGFloat titleWidth = contentWidth;

    [_titleLabel setFrame:NSMakeRect(inset, 18.0, titleWidth, 28.0)];
    [_statusLabel setFrame:NSMakeRect(inset, 48.0, titleWidth, 18.0)];
    [_analyzerView setFrame:NSMakeRect(inset, analyzerTop, contentWidth, analyzerHeight)];

    {
        const CGFloat toggleTop = controlsTop;
        const CGFloat toggleGap = 186.0;
        const CGFloat sliderTop = controlsTop + 36.0;
        const CGFloat rowHeight = 54.0;
        const CGFloat columnGap = 26.0;
        const CGFloat columnWidth = (sliderAreaWidth - columnGap) * 0.5;
        int sliderIndex = 0;
        int toggleIndex = 0;
        int orderIndex = 0;

        for (; orderIndex < FWAK_CONTROL_ORDER_COUNT; ++orderIndex) {
            const FwakControlManifestItem* manifest = &FWAK_CONTROL_MANIFEST[FWAK_CONTROL_ORDER[orderIndex]];
            const int parameterIndex = FwakParameterIndexForLabel(manifest->label);
            if (parameterIndex < 0) {
                continue;
            }
            if (FwakParameterUsesFrequencyEditor(parameterIndex)) {
                continue;
            }

            const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                [_controls[parameterIndex] setFrame:NSMakeRect(inset + toggleIndex * toggleGap, toggleTop, 172.0, 24.0)];
                toggleIndex += 1;
                continue;
            }

            const CGFloat columnX = inset + (sliderIndex % 2) * (columnWidth + columnGap);
            const CGFloat rowY = sliderTop + (sliderIndex / 2) * rowHeight;
            [_nameLabels[parameterIndex] setFrame:NSMakeRect(columnX, rowY, columnWidth - 72.0, 16.0)];
            [_valueLabels[parameterIndex] setFrame:NSMakeRect(columnX + columnWidth - 70.0, rowY, 70.0, 16.0)];
            [_controls[parameterIndex] setFrame:NSMakeRect(columnX, rowY + 18.0, columnWidth, 24.0)];
            sliderIndex += 1;
        }
    }

    {
        const CGFloat meterTop = controlsTop + 6.0;
        const CGFloat meterRow = 74.0;
        int meterIndex = 0;
        for (; meterIndex < FWAK_METER_COUNT; ++meterIndex) {
            const CGFloat y = meterTop + meterRow * meterIndex;
            [_meterLabels[meterIndex] setFrame:NSMakeRect(meterColumnX, y, meterWidth, 18.0)];
            [_meterViews[meterIndex] setFrame:NSMakeRect(meterColumnX, y + 24.0, meterWidth - 8.0, 18.0)];
            [_meterValues[meterIndex] setFrame:NSMakeRect(meterColumnX, y + 46.0, meterWidth, 18.0)];
        }
    }
}

- (void)parameterChanged:(id)sender
{
    const NSInteger parameterIndex = [sender tag];
    const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
    double value = 0.0;

    if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
        value = [(NSButton*)sender state] == NSControlStateValueOn ? 1.0 : 0.0;
    } else {
        value = [(NSSlider*)sender doubleValue];
    }

    fwak_update_parameter_from_ui(_plugin, info->id, value);
    if (!(info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL)) {
        [_valueLabels[parameterIndex] setStringValue:[self formattedValueForParameter:(int)parameterIndex]];
    }
}

- (void)updateMeters:(NSTimer*)timer
{
    (void)timer;

    int meterIndex = 0;
    for (; meterIndex < FWAK_METER_COUNT; ++meterIndex) {
        const FwakMeterManifestItem* manifest = &FWAK_METER_MANIFEST[meterIndex];
        const double rawValue = FwakMeterValueForId(_plugin, manifest->id);
        const double meterValue = manifest->isGainReduction ? fmax(0.0, rawValue) : fmax(0.0, rawValue + 72.0);

        [_meterViews[meterIndex] setMaxValue:manifest->maxValue];
        [_meterViews[meterIndex] setDoubleValue:fmin(manifest->maxValue, meterValue)];
        [_meterValues[meterIndex] setStringValue:[NSString stringWithFormat:@"%.1f dB", rawValue]];
    }

    [_analyzerView setNeedsDisplay:YES];
}

@end

@implementation FWAK_AUV2_FACTORY_CLASS

- (unsigned)interfaceVersion
{
    return 0;
}

- (NSString*)description
{
    return [NSString stringWithFormat:@"%s View", FWAK_PRODUCT_NAME];
}

- (NSView*)uiViewForAudioUnit:(AudioUnit)inAudioUnit withSize:(NSSize)inPreferredSize
{
    UInt64 userPluginValue = 0;
    UInt32 dataSize = (UInt32)sizeof(userPluginValue);
    OSStatus status =
        AudioUnitGetProperty(inAudioUnit, kAudioUnitProperty_UserPlugin, kAudioUnitScope_Global, 0, &userPluginValue, &dataSize);
    if (status != noErr || userPluginValue == 0) {
        return nil;
    }

    FWAK_PLUGIN_VIEW_CLASS* view = (FWAK_PLUGIN_VIEW_CLASS*)cplug_createGUI((void*)(uintptr_t)userPluginValue);
    if (!view) {
        return nil;
    }

    uint32_t width = 0;
    uint32_t height = 0;
    cplug_getSize(view, &width, &height);

    if (inPreferredSize.width > 0.0 && inPreferredSize.height > 0.0) {
        width = (uint32_t)lrint(fmax((double)width, inPreferredSize.width));
        height = (uint32_t)lrint(fmax((double)height, inPreferredSize.height));
    }

    cplug_setSize(view, width, height);
    return [view autorelease];
}

@end

void* cplug_createGUI(void* userPlugin)
{
    return [[FWAK_PLUGIN_VIEW_CLASS alloc] initWithPlugin:(FwakPlugin*)userPlugin];
}

void cplug_destroyGUI(void* userGUI)
{
    [(FWAK_PLUGIN_VIEW_CLASS*)userGUI release];
}

void cplug_setParent(void* userGUI, void* view)
{
    FWAK_PLUGIN_VIEW_CLASS* pluginView = (FWAK_PLUGIN_VIEW_CLASS*)userGUI;
    if ([pluginView superview]) {
        [pluginView removeFromSuperview];
    }
    if (view) {
        [(NSView*)view addSubview:pluginView];
    }
}

void cplug_setVisible(void* userGUI, bool visible)
{
    [(FWAK_PLUGIN_VIEW_CLASS*)userGUI setHidden:(visible ? NO : YES)];
}

void cplug_setScaleFactor(void* userGUI, float scale)
{
    FWAK_PLUGIN_VIEW_CLASS* pluginView = (FWAK_PLUGIN_VIEW_CLASS*)userGUI;
    if (pluginView == nil) {
        return;
    }
    [pluginView setNeedsLayout:YES];
    (void)scale;
}

void cplug_getSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    FWAK_PLUGIN_VIEW_CLASS* pluginView = (FWAK_PLUGIN_VIEW_CLASS*)userGUI;
    const NSSize size = pluginView ? [pluginView frame].size : NSMakeSize(FWAK_UI_DEFAULT_WIDTH, FwakMinimumViewHeight());
    *width = (uint32_t)lrint(fmax(size.width, FWAK_UI_DEFAULT_WIDTH));
    *height = (uint32_t)lrint(fmax(size.height, FwakMinimumViewHeight()));
}

void cplug_checkSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    (void)userGUI;
    *width = (uint32_t)fmax((double)*width, FWAK_UI_DEFAULT_WIDTH);
    *height = (uint32_t)fmax((double)*height, FwakMinimumViewHeight());
}

bool cplug_setSize(void* userGUI, uint32_t width, uint32_t height)
{
    FWAK_PLUGIN_VIEW_CLASS* pluginView = (FWAK_PLUGIN_VIEW_CLASS*)userGUI;
    if (!pluginView) {
        return false;
    }

    const NSRect currentFrame = [pluginView frame];
    [pluginView setFrame:NSMakeRect(currentFrame.origin.x, currentFrame.origin.y, width, height)];
    [pluginView setNeedsLayout:YES];
    return true;
}
