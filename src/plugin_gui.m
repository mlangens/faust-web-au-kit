#import <AppKit/AppKit.h>
#import <AudioToolbox/AUCocoaUIView.h>
#import <AudioToolbox/AudioUnit.h>

#include "plugin_core.h"

@interface FwakPluginView : NSView
{
@private
    FwakPlugin* _plugin;
    NSControl* _controls[FWAK_PARAMETER_COUNT];
    NSTextField* _valueLabels[FWAK_PARAMETER_COUNT];
    NSLevelIndicator* _inputPeakMeter;
    NSLevelIndicator* _outputPeakMeter;
    NSLevelIndicator* _gainReductionMeter;
    NSTextField* _inputPeakValue;
    NSTextField* _outputPeakValue;
    NSTextField* _gainReductionValue;
    NSTextField* _statusLabel;
    NSTimer* _meterTimer;
}

- (instancetype)initWithPlugin:(FwakPlugin*)plugin;
- (void)syncControlValues;

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
    NSLevelIndicator* meter =
        [[NSLevelIndicator alloc] initWithFrame:NSZeroRect];
    [meter setLevelIndicatorStyle:NSContinuousCapacityLevelIndicatorStyle];
    [meter setMinValue:0.0];
    [meter setMaxValue:maxValue];
    [meter setWarningValue:maxValue * 0.75];
    [meter setCriticalValue:maxValue * 0.92];
    [meter setEditable:NO];
    return meter;
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
    [self setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];

    NSTextField* titleLabel = FwakMakeLabel(@FWAK_PRODUCT_NAME, 24.0, NSFontWeightSemibold);
    [self addSubview:titleLabel];
    [titleLabel release];

    _statusLabel = FwakMakeLabel(@"4x oversampled native AU runtime, schema-ready for web preview tooling.", 11.0, NSFontWeightRegular);
    [_statusLabel setTextColor:[NSColor colorWithCalibratedWhite:0.35 alpha:1.0]];
    [self addSubview:_statusLabel];

    {
        int index = 0;
        for (; index < FWAK_PARAMETER_COUNT; ++index) {
            const FwakParameterInfo* info = &gFwakParameters[index];
            NSTextField* nameLabel = FwakMakeLabel([NSString stringWithUTF8String:info->label], 12.0, NSFontWeightMedium);
            [self addSubview:nameLabel];
            [nameLabel release];

            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                NSButton* checkbox = [[NSButton alloc] initWithFrame:NSZeroRect];
                [checkbox setButtonType:NSSwitchButton];
                [checkbox setTitle:[NSString stringWithUTF8String:info->label]];
                [checkbox setTag:index];
                [checkbox setTarget:self];
                [checkbox setAction:@selector(parameterChanged:)];
                _controls[index] = checkbox;
                [self addSubview:checkbox];
                [checkbox release];
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
                [slider release];
            }

            _valueLabels[index] = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
            [_valueLabels[index] setAlignment:NSTextAlignmentRight];
            [_valueLabels[index] setTextColor:[NSColor colorWithCalibratedWhite:0.32 alpha:1.0]];
            [self addSubview:_valueLabels[index]];
        }
    }

    _inputPeakMeter = FwakMakeMeter(78.0);
    _outputPeakMeter = FwakMakeMeter(78.0);
    _gainReductionMeter = FwakMakeMeter(24.0);
    _inputPeakValue = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
    _outputPeakValue = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
    _gainReductionValue = FwakMakeLabel(@"", 11.0, NSFontWeightRegular);
    [_inputPeakValue setAlignment:NSTextAlignmentRight];
    [_outputPeakValue setAlignment:NSTextAlignmentRight];
    [_gainReductionValue setAlignment:NSTextAlignmentRight];

    [self addSubview:FwakMakeLabel(@"Input Peak", 12.0, NSFontWeightMedium)];
    [[[self subviews] lastObject] release];
    [self addSubview:FwakMakeLabel(@"Output Peak", 12.0, NSFontWeightMedium)];
    [[[self subviews] lastObject] release];
    [self addSubview:FwakMakeLabel(@"Gain Reduction", 12.0, NSFontWeightMedium)];
    [[[self subviews] lastObject] release];
    [self addSubview:_inputPeakMeter];
    [self addSubview:_outputPeakMeter];
    [self addSubview:_gainReductionMeter];
    [self addSubview:_inputPeakValue];
    [self addSubview:_outputPeakValue];
    [self addSubview:_gainReductionValue];

    [self syncControlValues];
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
    [_statusLabel release];
    [_inputPeakMeter release];
    [_outputPeakMeter release];
    [_gainReductionMeter release];
    [_inputPeakValue release];
    [_outputPeakValue release];
    [_gainReductionValue release];

    {
        int index = 0;
        for (; index < FWAK_PARAMETER_COUNT; ++index) {
            [_valueLabels[index] release];
        }
    }

    [super dealloc];
}

- (void)layout
{
    [super layout];

    const CGFloat inset = 24.0;
    const CGFloat boundsWidth = self.bounds.size.width;
    const CGFloat controlColumnWidth = boundsWidth * 0.62;
    const CGFloat meterColumnX = inset + controlColumnWidth + 28.0;
    const CGFloat meterWidth = boundsWidth - meterColumnX - inset;

    NSArray* subviews = [self subviews];
    NSTextField* titleLabel = [subviews objectAtIndex:0];

    [titleLabel setFrame:NSMakeRect(inset, 18.0, controlColumnWidth, 28.0)];
    [_statusLabel setFrame:NSMakeRect(inset, 48.0, boundsWidth - (inset * 2.0), 18.0)];

    {
        const CGFloat rowTop = 94.0;
        const CGFloat rowHeight = 44.0;
        int index = 0;
        int sliderRow = 0;

        for (; index < FWAK_PARAMETER_COUNT; ++index) {
            const FwakParameterInfo* info = &gFwakParameters[index];
            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                continue;
            }

            NSTextField* label = [subviews objectAtIndex:2 + (index * 2)];
            const CGFloat y = rowTop + sliderRow * rowHeight;
            [label setFrame:NSMakeRect(inset, y, 140.0, 18.0)];
            [_controls[index] setFrame:NSMakeRect(inset + 150.0, y - 2.0, controlColumnWidth - 230.0, 24.0)];
            [_valueLabels[index] setFrame:NSMakeRect(inset + controlColumnWidth - 70.0, y, 70.0, 18.0)];
            sliderRow += 1;
        }

        const CGFloat toggleTop = rowTop + sliderRow * rowHeight + 18.0;
        NSTextField* vintageLabel = [subviews objectAtIndex:2 + (FWAK_PARAM_VINTAGE_CHARACTER * 2)];
        NSTextField* bypassLabel = [subviews objectAtIndex:2 + (FWAK_PARAM_BYPASS * 2)];
        [vintageLabel setHidden:YES];
        [bypassLabel setHidden:YES];
        [_valueLabels[FWAK_PARAM_VINTAGE_CHARACTER] setHidden:YES];
        [_valueLabels[FWAK_PARAM_BYPASS] setHidden:YES];
        [_controls[FWAK_PARAM_VINTAGE_CHARACTER] setFrame:NSMakeRect(inset, toggleTop, 210.0, 24.0)];
        [_controls[FWAK_PARAM_BYPASS] setFrame:NSMakeRect(inset + 220.0, toggleTop, 160.0, 24.0)];
    }

    {
        NSArray* meterLabels = [subviews subarrayWithRange:NSMakeRange(subviews.count - 9, 3)];
        const CGFloat meterTop = 110.0;
        const CGFloat meterRow = 82.0;
        NSTextField* label0 = [meterLabels objectAtIndex:0];
        NSTextField* label1 = [meterLabels objectAtIndex:1];
        NSTextField* label2 = [meterLabels objectAtIndex:2];

        [label0 setFrame:NSMakeRect(meterColumnX, meterTop, meterWidth, 18.0)];
        [_inputPeakMeter setFrame:NSMakeRect(meterColumnX, meterTop + 24.0, meterWidth - 70.0, 18.0)];
        [_inputPeakValue setFrame:NSMakeRect(meterColumnX + meterWidth - 66.0, meterTop + 24.0, 66.0, 18.0)];

        [label1 setFrame:NSMakeRect(meterColumnX, meterTop + meterRow, meterWidth, 18.0)];
        [_outputPeakMeter setFrame:NSMakeRect(meterColumnX, meterTop + meterRow + 24.0, meterWidth - 70.0, 18.0)];
        [_outputPeakValue setFrame:NSMakeRect(meterColumnX + meterWidth - 66.0, meterTop + meterRow + 24.0, 66.0, 18.0)];

        [label2 setFrame:NSMakeRect(meterColumnX, meterTop + (meterRow * 2.0), meterWidth, 18.0)];
        [_gainReductionMeter setFrame:NSMakeRect(meterColumnX, meterTop + (meterRow * 2.0) + 24.0, meterWidth - 70.0, 18.0)];
        [_gainReductionValue setFrame:NSMakeRect(meterColumnX + meterWidth - 66.0, meterTop + (meterRow * 2.0) + 24.0, 66.0, 18.0)];
    }
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
        } else {
            [(NSSlider*)_controls[index] setDoubleValue:value];
            [_valueLabels[index] setStringValue:[self formattedValueForParameter:index]];
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
    [_inputPeakMeter setDoubleValue:fmax(0.0, _plugin->meterInputPeakDb + 72.0)];
    [_outputPeakMeter setDoubleValue:fmax(0.0, _plugin->meterOutputPeakDb + 72.0)];
    [_gainReductionMeter setDoubleValue:_plugin->meterGainReductionDb];

    [_inputPeakValue setStringValue:[NSString stringWithFormat:@"%.1f dB", _plugin->meterInputPeakDb]];
    [_outputPeakValue setStringValue:[NSString stringWithFormat:@"%.1f dB", _plugin->meterOutputPeakDb]];
    [_gainReductionValue setStringValue:[NSString stringWithFormat:@"%.1f dB", _plugin->meterGainReductionDb]];
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
    (void)userGUI;
    (void)scale;
}

void cplug_getSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    const NSSize size = [(NSView*)userGUI frame].size;
    *width = (uint32_t)size.width;
    *height = (uint32_t)size.height;
}

void cplug_checkSize(void* userGUI, uint32_t* width, uint32_t* height)
{
    (void)userGUI;
    if (*width < 700u) {
        *width = 700u;
    }
    if (*height < 420u) {
        *height = 420u;
    }
}

bool cplug_setSize(void* userGUI, uint32_t width, uint32_t height)
{
    [(NSView*)userGUI setFrameSize:NSMakeSize(width, height)];
    return true;
}

@interface FwakAuv2ViewFactory : NSObject <AUCocoaUIBase>
@end

@implementation FwakAuv2ViewFactory

- (NSView*)uiViewForAudioUnit:(AudioUnit)audioUnit withSize:(NSSize)preferredSize
{
    void* userPlugin = NULL;
    UInt32 dataSize = sizeof(userPlugin);
    const OSStatus status =
        AudioUnitGetProperty(audioUnit, kAudioUnitProperty_UserPlugin, kAudioUnitScope_Global, 0, &userPlugin, &dataSize);
    if (status != noErr || userPlugin == NULL) {
        return nil;
    }

    FwakPluginView* view = (FwakPluginView*)cplug_createGUI(userPlugin);
    if (preferredSize.width > 1.0 && preferredSize.height > 1.0) {
        cplug_setSize(view, (uint32_t)preferredSize.width, (uint32_t)preferredSize.height);
    }
    return view;
}

- (unsigned)interfaceVersion
{
    return 0;
}

@end
