#ifndef FWAK_PLUGIN_PARAMETERS_H
#define FWAK_PLUGIN_PARAMETERS_H

#include "plugin_core.h"

void fwak_bind_parameter_zone_by_label(FwakPlugin* plugin, const char* label, float* zone);
void fwak_apply_cached_parameter_values(FwakPlugin* plugin);

#endif
