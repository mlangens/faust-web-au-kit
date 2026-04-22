#ifndef FWAK_PLUGIN_GUI_SHARED_H
#define FWAK_PLUGIN_GUI_SHARED_H

#import <AppKit/AppKit.h>

#include "plugin_core.h"

int FwakParameterIndexForLabel(const char* label);
double FwakMeterValueForId(const FwakPlugin* plugin, const char* meterId);
int FwakDriveTargetParameterIndex(void);
int FwakDriveFocusParameterIndex(void);
int FwakDriveLowSplitParameterIndex(void);
int FwakDriveHighSplitParameterIndex(void);
BOOL FwakSupportsFrequencyEditor(void);
BOOL FwakParameterUsesFrequencyEditor(int parameterIndex);
NSInteger FwakVisibleSliderCount(void);
CGFloat FwakMinimumViewHeight(void);
NSString* FwakParameterDisplayString(FwakPlugin* plugin, int parameterIndex);

#endif
