#include "plugin_core.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "faust/gui/CInterface.h"
#include FWAK_GENERATED_C_TARGET_PATH

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define FWAK_FOURCC(a, b, c, d)                                                                                       \
    (((uint32_t)(uint8_t)(a) << 24) | ((uint32_t)(uint8_t)(b) << 16) | ((uint32_t)(uint8_t)(c) << 8) |             \
     ((uint32_t)(uint8_t)(d)))

typedef struct {
    uint32_t id;
    float value;
} FwakSavedParameter;

static const char* gDriveTargetLabels[] = {"Both", "Mid", "Side"};
static const char* gDriveFocusLabels[] = {"Full", "Low", "Mid", "High"};
static const char* gAnalyzerZoneLabels[FWAK_ANALYZER_ZONE_COUNT] = {
    "Drive Low Saturation",
    "Drive Mid Saturation",
    "Drive High Saturation"
};

void cplug_libraryLoad() {}
void cplug_libraryUnload() {}

int fwak_find_parameter_index_by_label(const char* label)
{
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        if (strcmp(label, gFwakParameters[index].label) == 0) {
            return index;
        }
    }
    return -1;
}

int fwak_find_parameter_index_by_id(uint32_t paramId)
{
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        if (gFwakParameters[index].id == paramId) {
            return index;
        }
    }
    return -1;
}

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

static float fwak_clampf(float value, float minValue, float maxValue)
{
    if (value < minValue) {
        return minValue;
    }
    if (value > maxValue) {
        return maxValue;
    }
    return value;
}

static float fwak_quantize_parameter_value(const FwakParameterInfo* info, float value)
{
    if (!info) {
        return value;
    }

    if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
        return value >= 0.5f ? 1.0f : 0.0f;
    }

    if (info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_TARGET || info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_FOCUS) {
        return roundf(value);
    }

    return value;
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

static float fwak_compute_filter_coeff(double sampleRate, double cutoffHz)
{
    if (sampleRate <= 0.0 || cutoffHz <= 0.0) {
        return 1.0f;
    }
    return 1.0f - expf((float)(-2.0 * M_PI * cutoffHz / sampleRate));
}

static void fwak_reset_metering(FwakPlugin* plugin)
{
    plugin->meterInputEnvelope = 0.0f;
    plugin->meterOutputEnvelope = 0.0f;
    plugin->meterGainReductionEnvelope = 0.0f;
    fwak_atomic_store_float(&plugin->meterInputPeakDb, -72.0f);
    fwak_atomic_store_float(&plugin->meterOutputPeakDb, -72.0f);
    fwak_atomic_store_float(&plugin->meterGainReductionDb, 0.0f);
}

static void fwak_reset_analyzer_history(FwakPlugin* plugin)
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

static void fwak_push_analyzer_history(
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

static void fwak_update_meter_values(FwakPlugin* plugin, float sliceInputPeak, float sliceOutputPeak, uint32_t frames)
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

static void fwak_bind_parameter_zone(FwakPlugin* plugin, const char* label, float* zone)
{
    const int parameterIndex = fwak_find_parameter_index_by_label(label);
    if (parameterIndex >= 0) {
        plugin->zones[parameterIndex] = zone;
    }
}

static void fwak_ui_open_box(void* ui, const char* label)
{
    (void)ui;
    (void)label;
}

static void fwak_ui_close_box(void* ui)
{
    (void)ui;
}

static void fwak_ui_add_button(void* ui, const char* label, float* zone)
{
    fwak_bind_parameter_zone((FwakPlugin*)ui, label, zone);
}

static void fwak_ui_add_checkbox(void* ui, const char* label, float* zone)
{
    fwak_bind_parameter_zone((FwakPlugin*)ui, label, zone);
}

static void fwak_ui_add_slider(
    void* ui,
    const char* label,
    float* zone,
    float init,
    float minValue,
    float maxValue,
    float step)
{
    (void)minValue;
    (void)maxValue;
    (void)step;
    *zone = init;
    fwak_bind_parameter_zone((FwakPlugin*)ui, label, zone);
}

static void fwak_ui_add_num_entry(
    void* ui,
    const char* label,
    float* zone,
    float init,
    float minValue,
    float maxValue,
    float step)
{
    fwak_ui_add_slider(ui, label, zone, init, minValue, maxValue, step);
}

static void fwak_ui_add_bargraph(void* ui, const char* label, float* zone, float minValue, float maxValue)
{
    FwakPlugin* plugin = (FwakPlugin*)ui;
    const int analyzerIndex = fwak_find_analyzer_zone_index_by_label(label);
    if (analyzerIndex >= 0) {
        plugin->analyzerZones[analyzerIndex] = zone;
    } else {
        const int meterIndex = fwak_find_meter_index_by_label(label);
        if (meterIndex >= 0) {
            plugin->meterZones[meterIndex] = zone;
        }
    }
    (void)minValue;
    (void)maxValue;
}

static void fwak_ui_declare(void* ui, float* zone, const char* key, const char* value)
{
    (void)ui;
    (void)zone;
    (void)key;
    (void)value;
}

static void fwak_ui_add_soundfile(void* ui, const char* label, const char* url, struct Soundfile** zone)
{
    (void)ui;
    (void)label;
    (void)url;
    (void)zone;
}

static UIGlue fwak_make_ui_glue(FwakPlugin* plugin)
{
    UIGlue ui;
    memset(&ui, 0, sizeof(ui));
    ui.uiInterface = plugin;
    ui.openTabBox = fwak_ui_open_box;
    ui.openHorizontalBox = fwak_ui_open_box;
    ui.openVerticalBox = fwak_ui_open_box;
    ui.closeBox = fwak_ui_close_box;
    ui.addButton = fwak_ui_add_button;
    ui.addCheckButton = fwak_ui_add_checkbox;
    ui.addVerticalSlider = fwak_ui_add_slider;
    ui.addHorizontalSlider = fwak_ui_add_slider;
    ui.addNumEntry = fwak_ui_add_num_entry;
    ui.addHorizontalBargraph = fwak_ui_add_bargraph;
    ui.addVerticalBargraph = fwak_ui_add_bargraph;
    ui.addSoundfile = fwak_ui_add_soundfile;
    ui.declare = fwak_ui_declare;
    return ui;
}

static void fwak_allocate_audio_buffers(FwakPlugin* plugin, uint32_t maxBlockSize)
{
    const uint32_t oversampledFrames = maxBlockSize * FWAK_OVERSAMPLING_FACTOR;
    int channel = 0;
    for (; channel < FWAK_PLUGIN_NUM_INPUTS; ++channel) {
        free(plugin->upsampledInputStorage[channel]);
        plugin->upsampledInputStorage[channel] = (float*)calloc(oversampledFrames, sizeof(float));
        plugin->upsampledInputs[channel] = plugin->upsampledInputStorage[channel];
    }
    for (channel = 0; channel < FWAK_PLUGIN_NUM_OUTPUTS; ++channel) {
        free(plugin->upsampledOutputStorage[channel]);
        plugin->upsampledOutputStorage[channel] = (float*)calloc(oversampledFrames, sizeof(float));
        plugin->upsampledOutputs[channel] = plugin->upsampledOutputStorage[channel];
    }

    free(plugin->monoOutputScratch);
    plugin->monoOutputScratch = (float*)calloc(maxBlockSize, sizeof(float));
}

static void fwak_apply_cached_parameters(FwakPlugin* plugin)
{
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        if (plugin->zones[index]) {
            *plugin->zones[index] = plugin->paramValues[index];
        }
    }
}

static void fwak_process_audio_slice(
    FwakPlugin* plugin,
    float** inputs,
    float** outputs,
    uint32_t startFrame,
    uint32_t endFrame,
    uint32_t inputChannelCount,
    uint32_t outputChannelCount)
{
    const uint32_t factor = FWAK_OVERSAMPLING_FACTOR;
    const uint32_t frames = endFrame - startFrame;
    const uint32_t oversampledFrames = frames * factor;
    float inputPeak = 0.0f;
    float outputPeak = 0.0f;
    float sliceInputMin = 1.0f;
    float sliceInputMax = -1.0f;
    float sliceOutputMin = 1.0f;
    float sliceOutputMax = -1.0f;
    float driveLowSaturation = 0.0f;
    float driveMidSaturation = 0.0f;
    float driveHighSaturation = 0.0f;
    uint32_t frame = 0;

    for (; frame < frames; ++frame) {
        const float leftInputSample =
            (inputChannelCount > 0 && inputs[0]) ? inputs[0][startFrame + frame] : 0.0f;
        const float rightInputSample =
            (FWAK_PLUGIN_NUM_INPUTS < 2 || inputChannelCount < 2 || !inputs[1]) ? leftInputSample : inputs[1][startFrame + frame];
        const float visualInputSample = 0.5f * (leftInputSample + rightInputSample);
        int channel = 0;
        for (; channel < FWAK_PLUGIN_NUM_INPUTS; ++channel) {
            const float currentSample = channel == 0 ? leftInputSample : rightInputSample;
            const float previousSample = plugin->prevInput[channel];
            uint32_t substep = 0;
            for (; substep < factor; ++substep) {
                const float alpha = (float)(substep + 1) / (float)factor;
                plugin->upsampledInputs[channel][frame * factor + substep] =
                    previousSample + (currentSample - previousSample) * alpha;
            }
            plugin->prevInput[channel] = currentSample;
            inputPeak = fmaxf(inputPeak, fabsf(currentSample));
        }

        sliceInputMin = fminf(sliceInputMin, visualInputSample);
        sliceInputMax = fmaxf(sliceInputMax, visualInputSample);
    }

    FWAK_DSP_COMPUTE_FN((FWAK_DSP_TYPE*)plugin->dsp, (int)oversampledFrames, plugin->upsampledInputs, plugin->upsampledOutputs);
    driveLowSaturation =
        plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_LOW] ? *plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_LOW] : 0.0f;
    driveMidSaturation =
        plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_MID] ? *plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_MID] : 0.0f;
    driveHighSaturation = plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_HIGH]
                              ? *plugin->analyzerZones[FWAK_ANALYZER_ZONE_DRIVE_HIGH]
                              : 0.0f;

    for (frame = 0; frame < frames; ++frame) {
        float renderedFrame[FWAK_MAX_OUTPUT_CHANNELS] = {0.0f};
        int channel = 0;
        for (; channel < FWAK_PLUGIN_NUM_OUTPUTS; ++channel) {
            uint32_t substep = 0;
            float filteredSample = 0.0f;
            for (; substep < factor; ++substep) {
                const float rawSample = plugin->upsampledOutputs[channel][frame * factor + substep];
                plugin->decimateState[channel][0] +=
                    plugin->decimateCoeff * (rawSample - plugin->decimateState[channel][0]);
                plugin->decimateState[channel][1] +=
                    plugin->decimateCoeff * (plugin->decimateState[channel][0] - plugin->decimateState[channel][1]);
                filteredSample = plugin->decimateState[channel][1];
            }
            renderedFrame[channel] = filteredSample;
        }

        if (FWAK_PLUGIN_NUM_OUTPUTS == 1) {
            const float monoOut = renderedFrame[0];
            outputs[0][startFrame + frame] = monoOut;
            outputPeak = fmaxf(outputPeak, fabsf(monoOut));
            sliceOutputMin = fminf(sliceOutputMin, monoOut);
            sliceOutputMax = fmaxf(sliceOutputMax, monoOut);
        } else if (outputChannelCount < 2 || !outputs[1]) {
            const float monoOut = 0.5f * (renderedFrame[0] + renderedFrame[1]);
            outputs[0][startFrame + frame] = monoOut;
            outputPeak = fmaxf(outputPeak, fabsf(monoOut));
            sliceOutputMin = fminf(sliceOutputMin, monoOut);
            sliceOutputMax = fmaxf(sliceOutputMax, monoOut);
        } else {
            for (channel = 0; channel < FWAK_PLUGIN_NUM_OUTPUTS; ++channel) {
                outputs[channel][startFrame + frame] = renderedFrame[channel];
                outputPeak = fmaxf(outputPeak, fabsf(renderedFrame[channel]));
            }
            {
                const float visualOutputSample = 0.5f * (renderedFrame[0] + renderedFrame[1]);
                sliceOutputMin = fminf(sliceOutputMin, visualOutputSample);
                sliceOutputMax = fmaxf(sliceOutputMax, visualOutputSample);
            }
        }
    }

    fwak_update_meter_values(plugin, inputPeak, outputPeak, frames);
    if (frames == 0) {
        sliceInputMin = 0.0f;
        sliceInputMax = 0.0f;
        sliceOutputMin = 0.0f;
        sliceOutputMax = 0.0f;
    }
    fwak_push_analyzer_history(
        plugin,
        fwak_clampf(sliceInputMin, -1.0f, 1.0f),
        fwak_clampf(sliceInputMax, -1.0f, 1.0f),
        fwak_clampf(sliceOutputMin, -1.0f, 1.0f),
        fwak_clampf(sliceOutputMax, -1.0f, 1.0f),
        fwak_atomic_load_float(&plugin->meterGainReductionDb),
        fwak_clampf(driveLowSaturation, 0.0f, 1.0f),
        fwak_clampf(driveMidSaturation, 0.0f, 1.0f),
        fwak_clampf(driveHighSaturation, 0.0f, 1.0f));
}

void* cplug_createPlugin(CplugHostContext* ctx)
{
    FwakPlugin* plugin = (FwakPlugin*)calloc(1, sizeof(FwakPlugin));
    int parameterIndex = 0;

    if (!plugin) {
        return NULL;
    }

    plugin->hostContext = ctx;
    plugin->sampleRate = 44100.0;
    plugin->maxBlockSize = 512;
    plugin->dsp = FWAK_DSP_NEW_FN();

    if (!plugin->dsp) {
        free(plugin);
        return NULL;
    }

    FWAK_DSP_INIT_FN((FWAK_DSP_TYPE*)plugin->dsp, (int)(plugin->sampleRate * FWAK_OVERSAMPLING_FACTOR));
    {
        UIGlue ui = fwak_make_ui_glue(plugin);
        FWAK_DSP_BUILD_UI_FN((FWAK_DSP_TYPE*)plugin->dsp, &ui);
    }

    for (; parameterIndex < FWAK_PARAMETER_COUNT; ++parameterIndex) {
        plugin->paramValues[parameterIndex] = (float)gFwakParameters[parameterIndex].defaultValue;
    }

    fwak_allocate_audio_buffers(plugin, plugin->maxBlockSize);
    plugin->decimateCoeff = fwak_compute_filter_coeff(
        plugin->sampleRate * FWAK_OVERSAMPLING_FACTOR,
        fmin(18000.0, plugin->sampleRate * 0.45));
    fwak_reset_metering(plugin);
    fwak_reset_analyzer_history(plugin);
    fwak_apply_cached_parameters(plugin);
    return plugin;
}

void cplug_destroyPlugin(void* userPlugin)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    int channel = 0;
    if (!plugin) {
        return;
    }

    for (; channel < FWAK_PLUGIN_NUM_INPUTS; ++channel) {
        free(plugin->upsampledInputStorage[channel]);
    }
    for (channel = 0; channel < FWAK_PLUGIN_NUM_OUTPUTS; ++channel) {
        free(plugin->upsampledOutputStorage[channel]);
    }
    free(plugin->monoOutputScratch);

    if (plugin->dsp) {
        FWAK_DSP_DELETE_FN((FWAK_DSP_TYPE*)plugin->dsp);
    }

    free(plugin);
}

uint32_t cplug_getNumInputBusses(void* userPlugin)
{
    (void)userPlugin;
    return FWAK_PLUGIN_NUM_INPUTS > 0 ? 1u : 0u;
}

uint32_t cplug_getNumOutputBusses(void* userPlugin)
{
    (void)userPlugin;
    return FWAK_PLUGIN_NUM_OUTPUTS > 0 ? 1u : 0u;
}

uint32_t cplug_getInputBusChannelCount(void* userPlugin, uint32_t busIndex)
{
    (void)userPlugin;
    return busIndex == 0 ? FWAK_PLUGIN_NUM_INPUTS : 0u;
}

uint32_t cplug_getOutputBusChannelCount(void* userPlugin, uint32_t busIndex)
{
    (void)userPlugin;
    return busIndex == 0 ? FWAK_PLUGIN_NUM_OUTPUTS : 0u;
}

void cplug_getInputBusName(void* userPlugin, uint32_t busIndex, char* buffer, size_t bufferLength)
{
    (void)userPlugin;
    snprintf(buffer, bufferLength, "%s", busIndex == 0 ? "Input" : "");
}

void cplug_getOutputBusName(void* userPlugin, uint32_t busIndex, char* buffer, size_t bufferLength)
{
    (void)userPlugin;
    snprintf(buffer, bufferLength, "%s", busIndex == 0 ? "Output" : "");
}

uint32_t cplug_getNumParameters(void* userPlugin)
{
    (void)userPlugin;
    return FWAK_PARAMETER_COUNT;
}

uint32_t cplug_getParameterID(void* userPlugin, uint32_t paramIndex)
{
    (void)userPlugin;
    return gFwakParameters[paramIndex].id;
}

uint32_t cplug_getParameterFlags(void* userPlugin, uint32_t paramId)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        return parameterIndex >= 0 ? gFwakParameters[parameterIndex].flags : 0u;
    }
}

void cplug_getParameterRange(void* userPlugin, uint32_t paramId, double* minValue, double* maxValue)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        if (parameterIndex >= 0) {
            *minValue = gFwakParameters[parameterIndex].minValue;
            *maxValue = gFwakParameters[parameterIndex].maxValue;
        }
    }
}

void cplug_getParameterName(void* userPlugin, uint32_t paramId, char* buffer, size_t bufferLength)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        snprintf(buffer, bufferLength, "%s", parameterIndex >= 0 ? gFwakParameters[parameterIndex].label : "");
    }
}

double cplug_getParameterValue(void* userPlugin, uint32_t paramId)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
    return parameterIndex >= 0 ? plugin->paramValues[parameterIndex] : 0.0;
}

double cplug_getDefaultParameterValue(void* userPlugin, uint32_t paramId)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        return parameterIndex >= 0 ? gFwakParameters[parameterIndex].defaultValue : 0.0;
    }
}

static const char* fwak_parameter_value_to_enum_label(const FwakParameterInfo* info, float value)
{
    const int discreteValue = (int)lrintf(value);
    if (!info) {
        return NULL;
    }

    if (info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_TARGET) {
        return (discreteValue >= 0 && discreteValue < (int)(sizeof(gDriveTargetLabels) / sizeof(gDriveTargetLabels[0])))
                   ? gDriveTargetLabels[discreteValue]
                   : NULL;
    }

    if (info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_FOCUS) {
        return (discreteValue >= 0 && discreteValue < (int)(sizeof(gDriveFocusLabels) / sizeof(gDriveFocusLabels[0])))
                   ? gDriveFocusLabels[discreteValue]
                   : NULL;
    }

    return NULL;
}

void cplug_setParameterValue(void* userPlugin, uint32_t paramId, double value)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
    if (parameterIndex >= 0) {
        const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
        float clampedValue = fwak_clampf((float)value, (float)info->minValue, (float)info->maxValue);
        clampedValue = fwak_quantize_parameter_value(info, clampedValue);
        plugin->paramValues[parameterIndex] = clampedValue;
        if (plugin->zones[parameterIndex]) {
            *plugin->zones[parameterIndex] = clampedValue;
        }
    }
}

double cplug_denormaliseParameterValue(void* userPlugin, uint32_t paramId, double normalisedValue)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        if (parameterIndex >= 0) {
            const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
            const double span = info->maxValue - info->minValue;
            return info->minValue + span * normalisedValue;
        }
    }
    return 0.0;
}

double cplug_normaliseParameterValue(void* userPlugin, uint32_t paramId, double denormalisedValue)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        if (parameterIndex >= 0) {
            const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
            const double span = info->maxValue - info->minValue;
            if (span <= 0.0) {
                return 0.0;
            }
            return (denormalisedValue - info->minValue) / span;
        }
    }
    return 0.0;
}

double cplug_parameterStringToValue(void* userPlugin, uint32_t paramId, const char* stringValue)
{
    const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
    if (parameterIndex >= 0) {
        const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
        if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
            return (strcmp(stringValue, "On") == 0 || strcmp(stringValue, "1") == 0) ? 1.0 : 0.0;
        }

        if (info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_TARGET) {
            int index = 0;
            for (; index < (int)(sizeof(gDriveTargetLabels) / sizeof(gDriveTargetLabels[0])); ++index) {
                if (strcmp(stringValue, gDriveTargetLabels[index]) == 0) {
                    return index;
                }
            }
        }

        if (info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_FOCUS) {
            int index = 0;
            for (; index < (int)(sizeof(gDriveFocusLabels) / sizeof(gDriveFocusLabels[0])); ++index) {
                if (strcmp(stringValue, gDriveFocusLabels[index]) == 0) {
                    return index;
                }
            }
        }
    }
    return atof(stringValue);
}

void cplug_parameterValueToString(void* userPlugin, uint32_t paramId, char* buffer, size_t bufferLength, double value)
{
    (void)userPlugin;
    {
        const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
        if (parameterIndex >= 0) {
            const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
            const char* enumLabel = fwak_parameter_value_to_enum_label(info, (float)value);
            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                snprintf(buffer, bufferLength, "%s", value >= 0.5 ? "On" : "Off");
            } else if (enumLabel) {
                snprintf(buffer, bufferLength, "%s", enumLabel);
            } else if (strcmp(info->unit, "Hz") == 0) {
                snprintf(buffer, bufferLength, "%.0f %s", value, info->unit);
            } else if (info->unit[0] != '\0') {
                snprintf(buffer, bufferLength, "%.2f %s", value, info->unit);
            } else {
                snprintf(buffer, bufferLength, "%.2f", value);
            }
            return;
        }
    }
    buffer[0] = '\0';
}

uint32_t cplug_getLatencyInSamples(void* userPlugin)
{
    const FwakPlugin* plugin = (const FwakPlugin*)userPlugin;
    return (uint32_t)ceil(plugin->sampleRate * FWAK_PLUGIN_LATENCY_SECONDS);
}

uint32_t cplug_getTailInSamples(void* userPlugin)
{
    (void)userPlugin;
    return 0;
}

void cplug_setSampleRateAndBlockSize(void* userPlugin, double sampleRate, uint32_t maxBlockSize)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    plugin->sampleRate = sampleRate;
    plugin->maxBlockSize = maxBlockSize;
    plugin->decimateCoeff = fwak_compute_filter_coeff(
        sampleRate * FWAK_OVERSAMPLING_FACTOR,
        fmin(18000.0, sampleRate * 0.45));

    memset(plugin->prevInput, 0, sizeof(plugin->prevInput));
    memset(plugin->decimateState, 0, sizeof(plugin->decimateState));
    fwak_reset_metering(plugin);
    fwak_reset_analyzer_history(plugin);
    fwak_allocate_audio_buffers(plugin, maxBlockSize);

    FWAK_DSP_INSTANCE_INIT_FN((FWAK_DSP_TYPE*)plugin->dsp, (int)(sampleRate * FWAK_OVERSAMPLING_FACTOR));
    fwak_apply_cached_parameters(plugin);
}

void cplug_process(void* userPlugin, CplugProcessContext* ctx)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    CplugEvent event;
    uint32_t frame = 0;
    float** hostInputs = ctx->getAudioInput ? ctx->getAudioInput(ctx, 0) : NULL;
    float** hostOutputs = ctx->getAudioOutput ? ctx->getAudioOutput(ctx, 0) : NULL;
    float* resolvedInputs[FWAK_MAX_INPUT_CHANNELS] = {0};
    float* resolvedOutputs[FWAK_MAX_OUTPUT_CHANNELS] = {0};

    if (!hostOutputs || !hostOutputs[0]) {
        return;
    }

    resolvedOutputs[0] = hostOutputs[0];
    if (FWAK_PLUGIN_NUM_OUTPUTS > 1) {
        resolvedOutputs[1] = (ctx->numOutputs > 1 && hostOutputs[1]) ? hostOutputs[1] : plugin->monoOutputScratch;
    }

    if (FWAK_PLUGIN_NUM_INPUTS > 0) {
        resolvedInputs[0] = (ctx->numInputs > 0 && hostInputs && hostInputs[0]) ? hostInputs[0] : NULL;
    }
    if (FWAK_PLUGIN_NUM_INPUTS > 1) {
        resolvedInputs[1] =
            (ctx->numInputs > 1 && hostInputs && hostInputs[1]) ? hostInputs[1] : resolvedInputs[0];
    }

    while (ctx->dequeueEvent(ctx, &event, frame)) {
        switch (event.type) {
        case CPLUG_EVENT_PARAM_CHANGE_UPDATE:
            cplug_setParameterValue(plugin, event.parameter.id, event.parameter.value);
            break;
        case CPLUG_EVENT_PROCESS_AUDIO:
            fwak_process_audio_slice(
                plugin,
                resolvedInputs,
                resolvedOutputs,
                frame,
                event.processAudio.endFrame,
                ctx->numInputs,
                ctx->numOutputs);
            frame = event.processAudio.endFrame;
            break;
        default:
            break;
        }
    }
}

void cplug_saveState(void* userPlugin, const void* stateCtx, cplug_writeProc writeProc)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    FwakSavedParameter values[FWAK_PARAMETER_COUNT];
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        values[index].id = gFwakParameters[index].id;
        values[index].value = plugin->paramValues[index];
    }
    writeProc(stateCtx, values, sizeof(values));
}

void cplug_loadState(void* userPlugin, const void* stateCtx, cplug_readProc readProc)
{
    FwakSavedParameter values[FWAK_PARAMETER_COUNT];
    const int64_t bytesRead = readProc(stateCtx, values, sizeof(values));
    int index = 0;
    for (; index < bytesRead / (int64_t)sizeof(FwakSavedParameter); ++index) {
        cplug_setParameterValue(userPlugin, values[index].id, values[index].value);
    }
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

void fwak_begin_parameter_edit(FwakPlugin* plugin, uint32_t paramId)
{
    if (plugin->hostContext && plugin->hostContext->sendParamEvent) {
        CplugEvent event;
        memset(&event, 0, sizeof(event));
        event.parameter.type = CPLUG_EVENT_PARAM_CHANGE_BEGIN;
        event.parameter.id = paramId;
        plugin->hostContext->sendParamEvent(plugin->hostContext, &event);
    }
}

void fwak_update_parameter_from_ui(FwakPlugin* plugin, uint32_t paramId, double value)
{
    cplug_setParameterValue(plugin, paramId, value);
    if (plugin->hostContext && plugin->hostContext->sendParamEvent) {
        CplugEvent event;
        memset(&event, 0, sizeof(event));
        event.parameter.type = CPLUG_EVENT_PARAM_CHANGE_UPDATE;
        event.parameter.id = paramId;
        event.parameter.value = cplug_getParameterValue(plugin, paramId);
        plugin->hostContext->sendParamEvent(plugin->hostContext, &event);
    }
}

void fwak_end_parameter_edit(FwakPlugin* plugin, uint32_t paramId)
{
    if (plugin->hostContext && plugin->hostContext->sendParamEvent) {
        CplugEvent event;
        memset(&event, 0, sizeof(event));
        event.parameter.type = CPLUG_EVENT_PARAM_CHANGE_END;
        event.parameter.id = paramId;
        plugin->hostContext->sendParamEvent(plugin->hostContext, &event);
    }
}
