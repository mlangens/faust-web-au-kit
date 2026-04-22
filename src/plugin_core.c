#include "plugin_core.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "core/plugin_metering.h"
#include "core/plugin_parameters.h"
#include "faust/gui/CInterface.h"
#include FWAK_GENERATED_C_TARGET_PATH

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct {
    uint32_t id;
    float value;
} FwakSavedParameter;

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

static float fwak_compute_filter_coeff(double sampleRate, double cutoffHz)
{
    if (sampleRate <= 0.0 || cutoffHz <= 0.0) {
        return 1.0f;
    }
    return 1.0f - expf((float)(-2.0 * M_PI * cutoffHz / sampleRate));
}

void cplug_libraryLoad() {}
void cplug_libraryUnload() {}

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
    fwak_bind_parameter_zone_by_label((FwakPlugin*)ui, label, zone);
}

static void fwak_ui_add_checkbox(void* ui, const char* label, float* zone)
{
    fwak_bind_parameter_zone_by_label((FwakPlugin*)ui, label, zone);
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
    fwak_bind_parameter_zone_by_label((FwakPlugin*)ui, label, zone);
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
    fwak_bind_visual_zone_by_label((FwakPlugin*)ui, label, zone);
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
        fwak_get_meter_gain_reduction_db(plugin),
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
    fwak_apply_cached_parameter_values(plugin);
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
    fwak_apply_cached_parameter_values(plugin);
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
