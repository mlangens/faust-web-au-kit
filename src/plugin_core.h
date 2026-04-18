#ifndef FWAK_PLUGIN_CORE_H
#define FWAK_PLUGIN_CORE_H

#include <stdbool.h>
#include <stdint.h>

#include "cplug.h"
#include "project_config.h"

#define FWAK_UI_DEFAULT_WIDTH 820
#define FWAK_UI_DEFAULT_HEIGHT 460

enum {
    FWAK_PARAM_VINTAGE_CHARACTER = 0,
    FWAK_PARAM_BYPASS,
    FWAK_PARAM_INPUT_GAIN,
    FWAK_PARAM_CEILING,
    FWAK_PARAM_ATTACK,
    FWAK_PARAM_HOLD,
    FWAK_PARAM_RELEASE,
    FWAK_PARAM_OUTPUT_TRIM,
    FWAK_PARAMETER_COUNT
};

typedef struct {
    uint32_t id;
    const char* label;
    const char* unit;
    double minValue;
    double maxValue;
    double defaultValue;
    uint32_t flags;
} FwakParameterInfo;

typedef struct {
    CplugHostContext* hostContext;
    void* dsp;
    float* zones[FWAK_PARAMETER_COUNT];
    float paramValues[FWAK_PARAMETER_COUNT];
    float meterInputPeakDb;
    float meterOutputPeakDb;
    float meterGainReductionDb;
    float meterInputEnvelope;
    float meterOutputEnvelope;
    float meterGainReductionEnvelope;
    double sampleRate;
    uint32_t maxBlockSize;
    float upsampleCoeff;
    float decimateCoeff;
    float prevInput[FWAK_PLUGIN_NUM_INPUTS];
    float decimateState[FWAK_PLUGIN_NUM_OUTPUTS][2];
    float* upsampledInputs[FWAK_PLUGIN_NUM_INPUTS];
    float* upsampledOutputs[FWAK_PLUGIN_NUM_OUTPUTS];
    float* upsampledInputStorage[FWAK_PLUGIN_NUM_INPUTS];
    float* upsampledOutputStorage[FWAK_PLUGIN_NUM_OUTPUTS];
} FwakPlugin;

extern const FwakParameterInfo gFwakParameters[FWAK_PARAMETER_COUNT];

int fwak_find_parameter_index_by_id(uint32_t paramId);
void fwak_begin_parameter_edit(FwakPlugin* plugin, uint32_t paramId);
void fwak_update_parameter_from_ui(FwakPlugin* plugin, uint32_t paramId, double value);
void fwak_end_parameter_edit(FwakPlugin* plugin, uint32_t paramId);

#endif
