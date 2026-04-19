#import <AppKit/AppKit.h>
#import <AudioToolbox/AUCocoaUIView.h>
#import <AudioToolbox/AudioUnit.h>

#include <math.h>
#include <string.h>

#include "plugin_core.h"
#include "ui_manifest.h"

@interface FwakPluginView : NSView
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

@interface FwakAnalyzerView : NSView
{
@private
    FwakPlugin* _plugin;
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin;

@end

@interface FwakAuv2ViewFactory : NSObject <AUCocoaUIBase>
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
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        if (strcmp(gFwakParameters[index].label, label) == 0) {
            return index;
        }
    }
    return -1;
}

static double FwakMeterValueForId(const FwakPlugin* plugin, const char* meterId)
{
    if (strcmp(meterId, "inputPeak") == 0) {
        return fwak_get_meter_input_peak_db(plugin);
    }
    if (strcmp(meterId, "outputPeak") == 0) {
        return fwak_get_meter_output_peak_db(plugin);
    }
    if (strcmp(meterId, "gainReduction") == 0) {
        return fwak_get_meter_gain_reduction_db(plugin);
    }
    return 0.0;
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

@implementation FwakAnalyzerView

- (instancetype)initWithPlugin:(FwakPlugin*)plugin
{
    self = [super initWithFrame:NSZeroRect];
    if (!self) {
        return nil;
    }

    _plugin = plugin;
    [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    [self setWantsLayer:YES];
    return self;
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
    const NSRect panelRect = NSInsetRect(bounds, 2.0, 2.0);
    const NSRect plotRect = NSMakeRect(panelRect.origin.x + 18.0, panelRect.origin.y + 20.0, panelRect.size.width - 82.0, panelRect.size.height - 44.0);
    const CGFloat centerY = NSMidY(plotRect);
    const CGFloat halfHeight = plotRect.size.height * 0.47;
    const CGFloat maxGrDb = 18.0;

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

    if (_plugin) {
        FwakAnalyzerSnapshot snapshot;
        fwak_copy_analyzer_snapshot(_plugin, &snapshot);

        NSBezierPath* inputPath = [NSBezierPath bezierPath];
        NSBezierPath* outputPath = [NSBezierPath bezierPath];
        NSBezierPath* gainReductionPath = [NSBezierPath bezierPath];
        NSUInteger i = 0;

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

@implementation FwakPluginView

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
    self = [super initWithFrame:NSMakeRect(0, 0, FWAK_UI_DEFAULT_WIDTH, FWAK_UI_DEFAULT_HEIGHT)];
    if (!self) {
        return nil;
    }

    _plugin = plugin;
    _scaleFactor = 1.0;
    [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    [self setWantsLayer:YES];

    _analyzerView = [[FwakAnalyzerView alloc] initWithPlugin:plugin];
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
        if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
            [(NSButton*)_controls[index] setState:(value >= 0.5 ? NSControlStateValueOn : NSControlStateValueOff)];
            [_valueLabels[index] setHidden:YES];
            [_nameLabels[index] setHidden:YES];
        } else {
            [(NSSlider*)_controls[index] setDoubleValue:value];
            [_valueLabels[index] setStringValue:[self formattedValueForParameter:index]];
            [_valueLabels[index] setHidden:NO];
            [_nameLabels[index] setHidden:NO];
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

@implementation FwakAuv2ViewFactory

- (unsigned)interfaceVersion
{
    return 0;
}

- (NSString*)description
{
    return @"Limiter Lab View";
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

    FwakPluginView* view = (FwakPluginView*)cplug_createGUI((void*)(uintptr_t)userPluginValue);
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
    return [[FwakPluginView alloc] initWithPlugin:(FwakPlugin*)userPlugin];
}

void cplug_destroyGUI(void* userGUI)
{
    [(FwakPluginView*)userGUI release];
}

void cplug_setParent(void* userGUI, void* view)
{
    FwakPluginView* pluginView = (FwakPluginView*)userGUI;
    if ([pluginView superview]) {
        [pluginView removeFromSuperview];
    }
    if (view) {
        [(NSView*)view addSubview:pluginView];
    }
}

void cplug_setVisible(void* userGUI, bool visible)
{
    [(FwakPluginView*)userGUI setHidden:(visible ? NO : YES)];
}

void cplug_setScaleFactor(void* userGUI, float scale)
{
    FwakPluginView* pluginView = (FwakPluginView*)userGUI;
    if (pluginView == nil) {
        return;
    }
    [pluginView setNeedsLayout:YES];
    (void)scale;
}

void cplug_getSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    FwakPluginView* pluginView = (FwakPluginView*)userGUI;
    const NSSize size = pluginView ? [pluginView frame].size : NSMakeSize(FWAK_UI_DEFAULT_WIDTH, FWAK_UI_DEFAULT_HEIGHT);
    *width = (uint32_t)lrint(fmax(size.width, FWAK_UI_DEFAULT_WIDTH));
    *height = (uint32_t)lrint(fmax(size.height, FWAK_UI_DEFAULT_HEIGHT));
}

void cplug_checkSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    (void)userGUI;
    *width = (uint32_t)fmax((double)*width, FWAK_UI_DEFAULT_WIDTH);
    *height = (uint32_t)fmax((double)*height, FWAK_UI_DEFAULT_HEIGHT);
}

bool cplug_setSize(void* userGUI, uint32_t width, uint32_t height)
{
    FwakPluginView* pluginView = (FwakPluginView*)userGUI;
    if (!pluginView) {
        return false;
    }

    const NSRect currentFrame = [pluginView frame];
    [pluginView setFrame:NSMakeRect(currentFrame.origin.x, currentFrame.origin.y, width, height)];
    [pluginView setNeedsLayout:YES];
    return true;
}
