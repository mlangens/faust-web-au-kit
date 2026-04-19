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
    FWAK_PARAM_DISPLAY_DEFAULT = 0,
    FWAK_PARAM_DISPLAY_DRIVE_TARGET,
    FWAK_PARAM_DISPLAY_DRIVE_FOCUS
};

typedef struct {
    uint32_t id;
    const char* label;
    const char* unit;
    double minValue;
    double maxValue;
    double defaultValue;
    uint32_t flags;
    uint32_t displayKind;
} FwakParameterInfo;

#include "ui_manifest.h"

#define FWAK_PARAMETER_COUNT FWAK_CONTROL_COUNT
#define gFwakParameters FWAK_PARAMETER_MANIFEST

enum {
    FWAK_ANALYZER_ZONE_DRIVE_LOW = 0,
    FWAK_ANALYZER_ZONE_DRIVE_MID,
    FWAK_ANALYZER_ZONE_DRIVE_HIGH,
    FWAK_ANALYZER_ZONE_COUNT
};

enum {
    FWAK_MAX_INPUT_CHANNELS = FWAK_PLUGIN_NUM_INPUTS > 2 ? FWAK_PLUGIN_NUM_INPUTS : 2,
    FWAK_MAX_OUTPUT_CHANNELS = FWAK_PLUGIN_NUM_OUTPUTS > 2 ? FWAK_PLUGIN_NUM_OUTPUTS : 2
};

typedef struct {
    float inputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    float inputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    float outputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    float outputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    float gainReductionDb[FWAK_ANALYZER_HISTORY_LENGTH];
    float driveLowSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
    float driveMidSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
    float driveHighSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
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
    float prevInput[FWAK_MAX_INPUT_CHANNELS];
    float decimateState[FWAK_MAX_OUTPUT_CHANNELS][2];
    float* upsampledInputs[FWAK_MAX_INPUT_CHANNELS];
    float* upsampledOutputs[FWAK_MAX_OUTPUT_CHANNELS];
    float* upsampledInputStorage[FWAK_MAX_INPUT_CHANNELS];
    float* upsampledOutputStorage[FWAK_MAX_OUTPUT_CHANNELS];
    float* monoOutputScratch;
    float* analyzerZones[FWAK_ANALYZER_ZONE_COUNT];
    float* meterZones[FWAK_METER_COUNT];
    _Atomic float analyzerInputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerInputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerOutputMin[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerOutputMax[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerGainReductionDb[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerDriveLowSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerDriveMidSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic float analyzerDriveHighSaturation[FWAK_ANALYZER_HISTORY_LENGTH];
    _Atomic uint32_t analyzerWriteIndex;
} FwakPlugin;

int fwak_find_parameter_index_by_label(const char* label);
int fwak_find_parameter_index_by_id(uint32_t paramId);
float fwak_get_meter_input_peak_db(const FwakPlugin* plugin);
float fwak_get_meter_output_peak_db(const FwakPlugin* plugin);
float fwak_get_meter_gain_reduction_db(const FwakPlugin* plugin);
double fwak_get_meter_value(const FwakPlugin* plugin, const char* meterId);
void fwak_copy_analyzer_snapshot(const FwakPlugin* plugin, FwakAnalyzerSnapshot* snapshot);
bool fwak_has_analyzer_zones(const FwakPlugin* plugin);
void fwak_begin_parameter_edit(FwakPlugin* plugin, uint32_t paramId);
void fwak_update_parameter_from_ui(FwakPlugin* plugin, uint32_t paramId, double value);
void fwak_end_parameter_edit(FwakPlugin* plugin, uint32_t paramId);

#endif
