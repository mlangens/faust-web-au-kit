#include "core/plugin_metering.h"

#include <math.h>
#include <string.h>

static const char* gAnalyzerZoneLabels[FWAK_ANALYZER_ZONE_COUNT] = {
    "Drive Low Saturation",
    "Drive Mid Saturation",
    "Drive High Saturation"
};

static int fwak_find_analyzer_zone_index_by_label(const char* label)
{
    int index = 0;
    for (; index < FWAK_ANALYZER_ZONE_COUNT; ++index) {
        if (strcmp(label, gAnalyzerZoneLabels[index]) == 0) {
            return index;
        }
    }
    return -1;
}

static int fwak_find_meter_index_by_label(const char* label)
{
    int index = 0;
    for (; index < FWAK_METER_COUNT; ++index) {
        if (strcmp(label, FWAK_METER_MANIFEST[index].label) == 0) {
            return index;
        }
    }
    return -1;
}

static int fwak_find_meter_index_by_id(const char* meterId)
{
    int index = 0;
    for (; index < FWAK_METER_COUNT; ++index) {
        if (strcmp(meterId, FWAK_METER_MANIFEST[index].id) == 0) {
            return index;
        }
    }
    return -1;
}

static float fwak_atomic_load_float(const _Atomic float* value)
{
    return atomic_load_explicit(value, memory_order_relaxed);
}

static void fwak_atomic_store_float(_Atomic float* destination, float value)
{
    atomic_store_explicit(destination, value, memory_order_relaxed);
}

static float fwak_linear_to_db(float value)
{
    return 20.0f * log10f(fmaxf(value, 1.0e-6f));
}

static float fwak_decay_for_frames(double sampleRate, uint32_t frames, double tauSeconds)
{
    if (sampleRate <= 0.0 || tauSeconds <= 0.0) {
        return 0.0f;
    }
    return expf(-(float)frames / (float)(sampleRate * tauSeconds));
}

void fwak_bind_visual_zone_by_label(FwakPlugin* plugin, const char* label, float* zone)
{
    const int analyzerIndex = fwak_find_analyzer_zone_index_by_label(label);
    if (analyzerIndex >= 0) {
        plugin->analyzerZones[analyzerIndex] = zone;
        return;
    }

    {
        const int meterIndex = fwak_find_meter_index_by_label(label);
        if (meterIndex >= 0) {
            plugin->meterZones[meterIndex] = zone;
        }
    }
}

void fwak_reset_metering(FwakPlugin* plugin)
{
    plugin->meterInputEnvelope = 0.0f;
    plugin->meterOutputEnvelope = 0.0f;
    plugin->meterGainReductionEnvelope = 0.0f;
    fwak_atomic_store_float(&plugin->meterInputPeakDb, -72.0f);
    fwak_atomic_store_float(&plugin->meterOutputPeakDb, -72.0f);
    fwak_atomic_store_float(&plugin->meterGainReductionDb, 0.0f);
}

void fwak_reset_analyzer_history(FwakPlugin* plugin)
{
    uint32_t index = 0;
    for (; index < FWAK_ANALYZER_HISTORY_LENGTH; ++index) {
        fwak_atomic_store_float(&plugin->analyzerInputMin[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerInputMax[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerOutputMin[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerOutputMax[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerGainReductionDb[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerDriveLowSaturation[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerDriveMidSaturation[index], 0.0f);
        fwak_atomic_store_float(&plugin->analyzerDriveHighSaturation[index], 0.0f);
    }
    atomic_store_explicit(&plugin->analyzerWriteIndex, 0u, memory_order_relaxed);
}

void fwak_push_analyzer_history(
    FwakPlugin* plugin,
    float inputMin,
    float inputMax,
    float outputMin,
    float outputMax,
    float gainReductionDb,
    float driveLowSaturation,
    float driveMidSaturation,
    float driveHighSaturation)
{
    const uint32_t writeIndex = atomic_load_explicit(&plugin->analyzerWriteIndex, memory_order_relaxed);
    fwak_atomic_store_float(&plugin->analyzerInputMin[writeIndex], inputMin);
    fwak_atomic_store_float(&plugin->analyzerInputMax[writeIndex], inputMax);
    fwak_atomic_store_float(&plugin->analyzerOutputMin[writeIndex], outputMin);
    fwak_atomic_store_float(&plugin->analyzerOutputMax[writeIndex], outputMax);
    fwak_atomic_store_float(&plugin->analyzerGainReductionDb[writeIndex], gainReductionDb);
    fwak_atomic_store_float(&plugin->analyzerDriveLowSaturation[writeIndex], driveLowSaturation);
    fwak_atomic_store_float(&plugin->analyzerDriveMidSaturation[writeIndex], driveMidSaturation);
    fwak_atomic_store_float(&plugin->analyzerDriveHighSaturation[writeIndex], driveHighSaturation);
    atomic_store_explicit(
        &plugin->analyzerWriteIndex,
        (writeIndex + 1u) % FWAK_ANALYZER_HISTORY_LENGTH,
        memory_order_release);
}

void fwak_update_meter_values(FwakPlugin* plugin, float sliceInputPeak, float sliceOutputPeak, uint32_t frames)
{
    const float peakDecay = fwak_decay_for_frames(plugin->sampleRate, frames, 0.085);
    const float grDecay = fwak_decay_for_frames(plugin->sampleRate, frames, 0.120);
    const float inputEnvelope = fmaxf(sliceInputPeak, plugin->meterInputEnvelope * peakDecay);
    const float outputEnvelope = fmaxf(sliceOutputPeak, plugin->meterOutputEnvelope * peakDecay);
    const float gainReduction = fmaxf(0.0f, fwak_linear_to_db(inputEnvelope) - fwak_linear_to_db(outputEnvelope));

    plugin->meterInputEnvelope = inputEnvelope;
    plugin->meterOutputEnvelope = outputEnvelope;
    plugin->meterGainReductionEnvelope = fmaxf(gainReduction, plugin->meterGainReductionEnvelope * grDecay);
    fwak_atomic_store_float(&plugin->meterInputPeakDb, fwak_linear_to_db(plugin->meterInputEnvelope));
    fwak_atomic_store_float(&plugin->meterOutputPeakDb, fwak_linear_to_db(plugin->meterOutputEnvelope));
    fwak_atomic_store_float(&plugin->meterGainReductionDb, plugin->meterGainReductionEnvelope);
}

float fwak_get_meter_input_peak_db(const FwakPlugin* plugin)
{
    return fwak_atomic_load_float(&plugin->meterInputPeakDb);
}

float fwak_get_meter_output_peak_db(const FwakPlugin* plugin)
{
    return fwak_atomic_load_float(&plugin->meterOutputPeakDb);
}

float fwak_get_meter_gain_reduction_db(const FwakPlugin* plugin)
{
    return fwak_atomic_load_float(&plugin->meterGainReductionDb);
}

double fwak_get_meter_value(const FwakPlugin* plugin, const char* meterId)
{
    const int meterIndex = fwak_find_meter_index_by_id(meterId);
    if (meterIndex >= 0 && plugin->meterZones[meterIndex]) {
        return *plugin->meterZones[meterIndex];
    }
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

void fwak_copy_analyzer_snapshot(const FwakPlugin* plugin, FwakAnalyzerSnapshot* snapshot)
{
    uint32_t index = 0;
    if (!snapshot) {
        return;
    }

    for (; index < FWAK_ANALYZER_HISTORY_LENGTH; ++index) {
        snapshot->inputMin[index] = fwak_atomic_load_float(&plugin->analyzerInputMin[index]);
        snapshot->inputMax[index] = fwak_atomic_load_float(&plugin->analyzerInputMax[index]);
        snapshot->outputMin[index] = fwak_atomic_load_float(&plugin->analyzerOutputMin[index]);
        snapshot->outputMax[index] = fwak_atomic_load_float(&plugin->analyzerOutputMax[index]);
        snapshot->gainReductionDb[index] = fwak_atomic_load_float(&plugin->analyzerGainReductionDb[index]);
        snapshot->driveLowSaturation[index] = fwak_atomic_load_float(&plugin->analyzerDriveLowSaturation[index]);
        snapshot->driveMidSaturation[index] = fwak_atomic_load_float(&plugin->analyzerDriveMidSaturation[index]);
        snapshot->driveHighSaturation[index] = fwak_atomic_load_float(&plugin->analyzerDriveHighSaturation[index]);
    }

    snapshot->writeIndex = atomic_load_explicit(&plugin->analyzerWriteIndex, memory_order_acquire);
}

bool fwak_has_analyzer_zones(const FwakPlugin* plugin)
{
    int index = 0;

    if (!plugin) {
        return false;
    }

    for (; index < FWAK_ANALYZER_ZONE_COUNT; ++index) {
        if (plugin->analyzerZones[index]) {
            return true;
        }
    }

    return false;
}
