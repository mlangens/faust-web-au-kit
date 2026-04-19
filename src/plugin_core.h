#ifndef FWAK_PLUGIN_CORE_H
#define FWAK_PLUGIN_CORE_H

#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>

#include "cplug.h"
#include "project_config.h"

#define FWAK_UI_DEFAULT_WIDTH 940
#define FWAK_UI_DEFAULT_HEIGHT 560
#define FWAK_ANALYZER_HISTORY_LENGTH 320

enum {
    FWAK_PARAM_VINTAGE_RESPONSE = 0,
    FWAK_PARAM_BYPASS,
    FWAK_PARAM_TUBE_DRIVE,
    FWAK_PARAM_TRANSFORMER_TONE,
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
    float inputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    float inputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    float outputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    float outputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    float gainReductionDb[FWAK_ANALYZER_HISTORY_LENGTH];
    uint32_t writeIndex;
} FwakAnalyzerSnapshot;

typedef struct {
    CplugHostContext* hostContext;
    void* dsp;
    float* zones[FWAK_PARAMETER_COUNT];
    float paramValues[FWAK_PARAMETER_COUNT];
    _Atomic float meterInputPeakDb;
    _Atomic float meterOutputPeakDb;
    _Atomic float meterGainReductionDb;
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
    float* monoOutputScratch;
    _Atomic float analyzerInputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerInputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerOutputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerOutputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerGainReductionDb[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic uint32_t analyzerWriteIndex;
} FwakPlugin;

extern const FwakParameterInfo gFwakParameters[FWAK_PARAMETER_COUNT];

int fwak_find_parameter_index_by_id(uint32_t paramId);
float fwak_get_meter_input_peak_db(const FwakPlugin* plugin);
float fwak_get_meter_output_peak_db(const FwakPlugin* plugin);
float fwak_get_meter_gain_reduction_db(const FwakPlugin* plugin);
void fwak_copy_analyzer_snapshot(const FwakPlugin* plugin, FwakAnalyzerSnapshot* snapshot);
void fwak_begin_parameter_edit(FwakPlugin* plugin, uint32_t paramId);
void fwak_update_parameter_from_ui(FwakPlugin* plugin, uint32_t paramId, double value);
void fwak_end_parameter_edit(FwakPlugin* plugin, uint32_t paramId);

#endif
