#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "project_config.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#if GENERATED_TARGET_KIND == 1
#include <faust/gui/CInterface.h>
#include GENERATED_SOURCE_PATH

struct BenchUIState {
    FAUSTFLOAT* vintage_zone = nullptr;
};

static void ui_open_box(void*, const char*) {}
static void ui_close_box(void*) {}
static void ui_add_button(void*, const char*, FAUSTFLOAT*) {}
static void ui_add_vslider(void*, const char*, FAUSTFLOAT*, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT) {}
static void ui_add_hbargraph(void*, const char*, FAUSTFLOAT*, FAUSTFLOAT, FAUSTFLOAT) {}
static void ui_add_vbargraph(void*, const char*, FAUSTFLOAT*, FAUSTFLOAT, FAUSTFLOAT) {}
static void ui_add_soundfile(void*, const char*, const char*, Soundfile**) {}

static void ui_declare(void* ui, FAUSTFLOAT* zone, const char* key, const char* value)
{
    (void)ui;
    (void)zone;
    (void)key;
    (void)value;
}

static void ui_add_checkbox(void* ui, const char* label, FAUSTFLOAT* zone)
{
    auto* state = static_cast<BenchUIState*>(ui);
    if (std::strcmp(label, "Vintage Character") == 0) {
        state->vintage_zone = zone;
    }
}

static void ui_add_hslider(void* ui, const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT)
{
    auto* state = static_cast<BenchUIState*>(ui);
    if (std::strcmp(label, "Vintage Character") == 0) {
        state->vintage_zone = zone;
    }
    *zone = init;
}

static void ui_add_num_entry(void* ui, const char* label, FAUSTFLOAT* zone, FAUSTFLOAT init, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT)
{
    ui_add_hslider(ui, label, zone, init, 0, 0, 0);
}

static UIGlue makeBenchGlue(BenchUIState* state)
{
    UIGlue glue {};
    glue.uiInterface = state;
    glue.openTabBox = ui_open_box;
    glue.openHorizontalBox = ui_open_box;
    glue.openVerticalBox = ui_open_box;
    glue.closeBox = ui_close_box;
    glue.addButton = ui_add_button;
    glue.addCheckButton = ui_add_checkbox;
    glue.addVerticalSlider = ui_add_vslider;
    glue.addHorizontalSlider = ui_add_hslider;
    glue.addNumEntry = ui_add_num_entry;
    glue.addHorizontalBargraph = ui_add_hbargraph;
    glue.addVerticalBargraph = ui_add_vbargraph;
    glue.addSoundfile = ui_add_soundfile;
    glue.declare = ui_declare;
    return glue;
}
#elif GENERATED_TARGET_KIND == 2
#include <faust/gui/meta.h>
#include <faust/gui/MapUI.h>
#include <faust/dsp/dsp.h>
#include GENERATED_SOURCE_PATH
#else
#error Unsupported GENERATED_TARGET_KIND
#endif

int main(int argc, char** argv)
{
    const int sample_rate = argc > 1 ? std::atoi(argv[1]) : 48000;
    const int block_size = argc > 2 ? std::atoi(argv[2]) : 256;
    const int seconds = argc > 3 ? std::atoi(argv[3]) : 6;
    const int total_frames = sample_rate * seconds * FWAK_OVERSAMPLING_FACTOR;
    const int block_count = total_frames / block_size;

#if GENERATED_TARGET_KIND == 1
    auto* dsp = newLimiterLabDSP();
    initLimiterLabDSP(dsp, sample_rate * FWAK_OVERSAMPLING_FACTOR);
    BenchUIState ui_state {};
    auto glue = makeBenchGlue(&ui_state);
    buildUserInterfaceLimiterLabDSP(dsp, &glue);
    if (ui_state.vintage_zone) {
        *ui_state.vintage_zone = 1.0f;
    }
#else
    LimiterLabDSP dsp;
    dsp.init(sample_rate * FWAK_OVERSAMPLING_FACTOR);
    MapUI ui;
    dsp.buildUserInterface(&ui);
    ui.setParamValue("Vintage Character", 1.0f);
#endif

    float* input_l = static_cast<float*>(std::calloc(block_size, sizeof(float)));
    float* input_r = static_cast<float*>(std::calloc(block_size, sizeof(float)));
    float* output_l = static_cast<float*>(std::calloc(block_size, sizeof(float)));
    float* output_r = static_cast<float*>(std::calloc(block_size, sizeof(float)));
    float* inputs[] = {input_l, input_r};
    float* outputs[] = {output_l, output_r};

    double phase = 0.0;
    const double phase_inc = 997.0 / double(sample_rate * FWAK_OVERSAMPLING_FACTOR);

    const auto start = std::chrono::steady_clock::now();
    for (int block = 0; block < block_count; ++block) {
        for (int frame = 0; frame < block_size; ++frame) {
            const float carrier = std::sin(float(phase * 2.0 * M_PI));
            const float slow = std::sin(float(phase * 2.0 * M_PI * 0.25));
            const float sample = carrier * (0.6f + 0.35f * slow);
            input_l[frame] = sample;
            input_r[frame] = sample;
            phase += phase_inc;
            if (phase >= 1.0) {
                phase -= 1.0;
            }
        }
#if GENERATED_TARGET_KIND == 1
        computeLimiterLabDSP(dsp, block_size, inputs, outputs);
#else
        dsp.compute(block_size, inputs, outputs);
#endif
    }
    const auto end = std::chrono::steady_clock::now();

    const auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    const double elapsed_seconds = double(elapsed) / 1e9;
    const double ns_per_frame = double(elapsed) / double(block_count * block_size);
    const double realtime_factor = double(block_count * block_size) / (double(sample_rate * FWAK_OVERSAMPLING_FACTOR) * elapsed_seconds);

    const char* target = GENERATED_TARGET_KIND == 1 ? "c" : "cpp";
    std::printf(
        "{\"target\":\"%s\",\"processedFrames\":%d,\"elapsedSeconds\":%.9f,\"nsPerFrame\":%.3f,\"realtimeFactor\":%.3f}\n",
        target,
        block_count * block_size,
        elapsed_seconds,
        ns_per_frame,
        realtime_factor
    );

#if GENERATED_TARGET_KIND == 1
    deleteLimiterLabDSP(dsp);
#endif
    std::free(input_l);
    std::free(input_r);
    std::free(output_l);
    std::free(output_r);
    return 0;
}
