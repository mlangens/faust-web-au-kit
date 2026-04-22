#include "core/plugin_parameters.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char* gDriveTargetLabels[] = {"Both", "Mid", "Side"};
static const char* gDriveFocusLabels[] = {"Full", "Low", "Mid", "High"};

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

static bool fwak_parameter_has_enum_labels(const FwakParameterInfo* info)
{
    return info != NULL && info->enumLabels != NULL && info->enumLabelCount > 0u;
}

static const char* fwak_parameter_off_label(const FwakParameterInfo* info)
{
    return info != NULL && info->offLabel != NULL && info->offLabel[0] != '\0' ? info->offLabel : "Off";
}

static const char* fwak_parameter_on_label(const FwakParameterInfo* info)
{
    return info != NULL && info->onLabel != NULL && info->onLabel[0] != '\0' ? info->onLabel : "On";
}

static float fwak_quantize_parameter_value(const FwakParameterInfo* info, float value)
{
    if (!info) {
        return value;
    }

    if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
        return value >= 0.5f ? 1.0f : 0.0f;
    }

    if (fwak_parameter_has_enum_labels(info) || info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_TARGET ||
        info->displayKind == FWAK_PARAM_DISPLAY_DRIVE_FOCUS) {
        return roundf(value);
    }

    return value;
}

static const char* fwak_parameter_value_to_enum_label(const FwakParameterInfo* info, float value)
{
    if (!info) {
        return NULL;
    }

    if (fwak_parameter_has_enum_labels(info)) {
        const int discreteValue = (int)lrintf(value);
        const int baseValue = (int)lrint(info->minValue);
        const int enumIndex = discreteValue - baseValue;
        return (enumIndex >= 0 && enumIndex < (int)info->enumLabelCount) ? info->enumLabels[enumIndex] : NULL;
    }

    {
        const int discreteValue = (int)lrintf(value);

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
    }

    return NULL;
}

static double fwak_parameter_string_to_enum_value(const FwakParameterInfo* info, const char* stringValue)
{
    if (!info || !stringValue) {
        return NAN;
    }

    if (fwak_parameter_has_enum_labels(info)) {
        uint32_t index = 0;
        for (; index < info->enumLabelCount; ++index) {
            if (strcmp(stringValue, info->enumLabels[index]) == 0) {
                return info->minValue + (double)index;
            }
        }
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

    return NAN;
}

static void fwak_apply_parameter_value(FwakPlugin* plugin, int parameterIndex, float value)
{
    plugin->paramValues[parameterIndex] = value;
    if (plugin->zones[parameterIndex]) {
        *plugin->zones[parameterIndex] = value;
    }
}

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

void fwak_bind_parameter_zone_by_label(FwakPlugin* plugin, const char* label, float* zone)
{
    const int parameterIndex = fwak_find_parameter_index_by_label(label);
    if (parameterIndex >= 0) {
        plugin->zones[parameterIndex] = zone;
    }
}

void fwak_apply_cached_parameter_values(FwakPlugin* plugin)
{
    int index = 0;
    for (; index < FWAK_PARAMETER_COUNT; ++index) {
        if (plugin->zones[index]) {
            *plugin->zones[index] = plugin->paramValues[index];
        }
    }
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
    const FwakPlugin* plugin = (const FwakPlugin*)userPlugin;
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

void cplug_setParameterValue(void* userPlugin, uint32_t paramId, double value)
{
    FwakPlugin* plugin = (FwakPlugin*)userPlugin;
    const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
    if (parameterIndex >= 0) {
        const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
        float clampedValue = fwak_clampf((float)value, (float)info->minValue, (float)info->maxValue);
        clampedValue = fwak_quantize_parameter_value(info, clampedValue);
        fwak_apply_parameter_value(plugin, parameterIndex, clampedValue);
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
    (void)userPlugin;
    const int parameterIndex = fwak_find_parameter_index_by_id(paramId);
    if (parameterIndex >= 0) {
        const FwakParameterInfo* info = &gFwakParameters[parameterIndex];
        if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
            return (strcmp(stringValue, fwak_parameter_on_label(info)) == 0 || strcmp(stringValue, "On") == 0 ||
                    strcmp(stringValue, "1") == 0)
                       ? 1.0
                       : 0.0;
        }

        {
            const double enumValue = fwak_parameter_string_to_enum_value(info, stringValue);
            if (!isnan(enumValue)) {
                return enumValue;
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
            const char* unit = info->unit != NULL ? info->unit : "";
            if (info->flags & CPLUG_FLAG_PARAMETER_IS_BOOL) {
                snprintf(buffer, bufferLength, "%s", value >= 0.5 ? fwak_parameter_on_label(info) : fwak_parameter_off_label(info));
            } else if (enumLabel) {
                snprintf(buffer, bufferLength, "%s", enumLabel);
            } else if (strcmp(unit, "Hz") == 0) {
                snprintf(buffer, bufferLength, "%.0f %s", value, unit);
            } else if (unit[0] != '\0') {
                snprintf(buffer, bufferLength, "%.2f %s", value, unit);
            } else {
                snprintf(buffer, bufferLength, "%.2f", value);
            }
            return;
        }
    }
    buffer[0] = '\0';
}
