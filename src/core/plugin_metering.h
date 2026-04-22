#ifndef FWAK_PLUGIN_METERING_H
#define FWAK_PLUGIN_METERING_H

#include "plugin_core.h"

void fwak_bind_visual_zone_by_label(FwakPlugin* plugin, const char* label, float* zone);
void fwak_reset_metering(FwakPlugin* plugin);
void fwak_reset_analyzer_history(FwakPlugin* plugin);
void fwak_push_analyzer_history(
    FwakPlugin* plugin,
    float inputMin,
    float inputMax,
    float outputMin,
    float outputMax,
    float gainReductionDb,
    float driveLowSaturation,
    float driveMidSaturation,
    float driveHighSaturation);
void fwak_update_meter_values(FwakPlugin* plugin, float sliceInputPeak, float sliceOutputPeak, uint32_t frames);

#endif
