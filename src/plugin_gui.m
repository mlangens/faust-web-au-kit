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
    [label setTextColor:[NSColor colorWithCalibratedWhite:0.15 alpha:1.0]];
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
        return plugin->meterInputPeakDb;
    }
    if (strcmp(meterId, "outputPeak") == 0) {
        return plugin->meterOutputPeakDb;
    }
    if (strcmp(meterId, "gainReduction") == 0) {
        return plugin->meterGainReductionDb;
    }
    return 0.0;
}

@implementation FwakPluginView

- (BOOL)isFlipped
{
    return YES;
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

    _titleLabel = FwakMakeLabel(@FWAK_PRODUCT_NAME, 24.0, NSFontWeightSemibold);
    [self addSubview:_titleLabel];

    _statusLabel = FwakMakeLabel(@FWAK_STATUS_TEXT, 11.0, NSFontWeightRegular);
    [_statusLabel setTextColor:[NSColor colorWithCalibratedWhite:0.35 alpha:1.0]];
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
            [_valueLabels[index] setTextColor:[NSColor colorWithCalibratedWhite:0.32 alpha:1.0]];
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
    const CGFloat controlColumnWidth = FWAK_METER_COUNT > 0 ? boundsWidth * 0.62 : boundsWidth - inset * 2.0;
    const CGFloat meterColumnX = inset + controlColumnWidth + 28.0;
    const CGFloat meterWidth = boundsWidth - meterColumnX - inset;
    const CGFloat titleWidth = boundsWidth - inset * 2.0;

    [_titleLabel setFrame:NSMakeRect(inset, 18.0, titleWidth, 28.0)];
    [_statusLabel setFrame:NSMakeRect(inset, 48.0, titleWidth, 18.0)];

    {
        const CGFloat rowTop = 94.0;
        const CGFloat rowHeight = 44.0;
        const CGFloat toggleGap = 220.0;
        const CGFloat toggleTopPadding = 18.0;
        int sliderRow = 0;
        int toggleRow = 0;
        int orderIndex = 0;

        for (; orderIndex < FWAK_CONTROL_ORDER_COUNT; ++orderIndex) {
            const FwakControlManifestItem* manifest = &FWAK_CONTROL_MANIFEST[FWAK_CONTROL_ORDER[orderIndex]];
            const int parameterIndex = FwakParameterIndexForLabel(manifest->label);
            if (parameterIndex < 0) {
                continue;
            }

            const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                const CGFloat toggleTop = rowTop + sliderRow * rowHeight + toggleTopPadding + toggleRow * 28.0;
                [_controls[parameterIndex] setFrame:NSMakeRect(inset + toggleRow * toggleGap, toggleTop, 210.0, 24.0)];
                toggleRow += 1;
                continue;
            }

            const CGFloat y = rowTop + sliderRow * rowHeight;
            [_nameLabels[parameterIndex] setFrame:NSMakeRect(inset, y, 140.0, 18.0)];
            [_controls[parameterIndex] setFrame:NSMakeRect(inset + 150.0, y - 2.0, controlColumnWidth - 230.0, 24.0)];
            [_valueLabels[parameterIndex] setFrame:NSMakeRect(inset + controlColumnWidth - 70.0, y, 70.0, 18.0)];
            sliderRow += 1;
        }
    }

    {
        const CGFloat meterTop = 110.0;
        const CGFloat meterRow = 82.0;
        int meterIndex = 0;
        for (; meterIndex < FWAK_METER_COUNT; ++meterIndex) {
            const CGFloat y = meterTop + meterRow * meterIndex;
            [_meterLabels[meterIndex] setFrame:NSMakeRect(meterColumnX, y, meterWidth, 18.0)];
            [_meterViews[meterIndex] setFrame:NSMakeRect(meterColumnX, y + 24.0, meterWidth - 70.0, 18.0)];
            [_meterValues[meterIndex] setFrame:NSMakeRect(meterColumnX + meterWidth - 66.0, y + 24.0, 66.0, 18.0)];
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
}

@end

@implementation FwakAuv2ViewFactory

- (unsigned)interfaceVersion
{
    return 0;
}

- (NSString*)description
{
    return [NSString stringWithString:@"Limiter Lab View"];
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
