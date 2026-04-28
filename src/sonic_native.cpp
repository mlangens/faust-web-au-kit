#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include <faust/dsp/dsp.h>
#include <faust/gui/MapUI.h>
#include <faust/gui/meta.h>
#include GENERATED_SOURCE_PATH

#ifndef GENERATED_CPP_CLASS
#error GENERATED_CPP_CLASS must be defined
#endif

static bool read_exact(float* destination, size_t count)
{
    const size_t wanted = count * sizeof(float);
    const size_t received = std::fread(destination, 1, wanted, stdin);
    if (received < wanted) {
        std::memset(reinterpret_cast<unsigned char*>(destination) + received, 0, wanted - received);
    }
    return true;
}

static bool write_exact(const float* source, size_t count)
{
    const size_t wanted = count * sizeof(float);
    return std::fwrite(source, 1, wanted, stdout) == wanted;
}

int main(int argc, char** argv)
{
    if (argc < 4) {
        std::fprintf(stderr, "usage: sonic-native <sample-rate> <block-size> <frames> [label value]...\n");
        return 64;
    }

    const int sample_rate = std::max(8000, std::atoi(argv[1]));
    const int block_size = std::max(16, std::atoi(argv[2]));
    const int frame_count = std::max(1, std::atoi(argv[3]));

    GENERATED_CPP_CLASS dsp;
    dsp.init(sample_rate);

    MapUI ui;
    dsp.buildUserInterface(&ui);
    for (int index = 4; index + 1 < argc; index += 2) {
        ui.setParamValue(argv[index], static_cast<FAUSTFLOAT>(std::atof(argv[index + 1])));
    }

    const int input_count = std::max(0, dsp.getNumInputs());
    const int output_count = std::max(0, dsp.getNumOutputs());
    std::vector<std::vector<float>> input_full(input_count, std::vector<float>(frame_count, 0.0f));
    std::vector<std::vector<float>> output_full(output_count, std::vector<float>(frame_count, 0.0f));

    for (int channel = 0; channel < input_count; ++channel) {
        if (!read_exact(input_full[channel].data(), static_cast<size_t>(frame_count))) {
            std::fprintf(stderr, "failed to read input channel %d: %s\n", channel, std::strerror(errno));
            return 65;
        }
    }

    std::vector<std::vector<float>> input_block(input_count, std::vector<float>(block_size, 0.0f));
    std::vector<std::vector<float>> output_block(output_count, std::vector<float>(block_size, 0.0f));
    std::vector<float*> input_ptrs(input_count, nullptr);
    std::vector<float*> output_ptrs(output_count, nullptr);

    for (int channel = 0; channel < input_count; ++channel) {
        input_ptrs[channel] = input_block[channel].data();
    }
    for (int channel = 0; channel < output_count; ++channel) {
        output_ptrs[channel] = output_block[channel].data();
    }

    for (int frame = 0; frame < frame_count; frame += block_size) {
        const int frames_this_block = std::min(block_size, frame_count - frame);
        for (int channel = 0; channel < input_count; ++channel) {
            std::fill(input_block[channel].begin(), input_block[channel].end(), 0.0f);
            std::copy_n(input_full[channel].data() + frame, frames_this_block, input_block[channel].data());
        }
        for (int channel = 0; channel < output_count; ++channel) {
            std::fill(output_block[channel].begin(), output_block[channel].end(), 0.0f);
        }

        dsp.compute(frames_this_block, input_ptrs.data(), output_ptrs.data());

        for (int channel = 0; channel < output_count; ++channel) {
            std::copy_n(output_block[channel].data(), frames_this_block, output_full[channel].data() + frame);
        }
    }

    for (int channel = 0; channel < output_count; ++channel) {
        if (!write_exact(output_full[channel].data(), static_cast<size_t>(frame_count))) {
            std::fprintf(stderr, "failed to write output channel %d: %s\n", channel, std::strerror(errno));
            return 66;
        }
    }

    return 0;
}
