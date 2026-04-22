#include "gui/plugin_gui_shared.h"

#include <math.h>

int FwakParameterIndexForLabel(const char* label)
{
    return fwak_find_parameter_index_by_label(label);
}

double FwakMeterValueForId(const FwakPlugin* plugin, const char* meterId)
{
    return fwak_get_meter_value(plugin, meterId);
}

int FwakDriveTargetParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Target");
    }
    return cachedIndex;
}

int FwakDriveFocusParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Focus");
    }
    return cachedIndex;
}

int FwakDriveLowSplitParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive Low Split");
    }
    return cachedIndex;
}

int FwakDriveHighSplitParameterIndex(void)
{
    static int cachedIndex = -2;
    if (cachedIndex == -2) {
        cachedIndex = FwakParameterIndexForLabel("Drive High Split");
    }
    return cachedIndex;
}

BOOL FwakSupportsFrequencyEditor(void)
{
    return FwakDriveLowSplitParameterIndex() >= 0 && FwakDriveHighSplitParameterIndex() >= 0;
}

BOOL FwakParameterUsesFrequencyEditor(int parameterIndex)
{
    return parameterIndex == FwakDriveLowSplitParameterIndex() || parameterIndex == FwakDriveHighSplitParameterIndex();
}

NSInteger FwakVisibleSliderCount(void)
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

CGFloat FwakMinimumViewHeight(void)
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

NSString* FwakParameterDisplayString(FwakPlugin* plugin, int parameterIndex)
{
    if (parameterIndex < 0 || parameterIndex >= FWAK_PARAMETER_COUNT) {
        return @"";
    }
    char buffer[64];
    const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
    cplug_parameterValueToString(plugin, info->id, buffer, sizeof(buffer), cplug_getParameterValue(plugin, info->id));
    return [NSString stringWithUTF8String:buffer];
}
