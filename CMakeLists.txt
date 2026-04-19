cmake_minimum_required(VERSION 3.20)

project(faust_web_au_kit VERSION 0.3.0 DESCRIPTION "Monorepo-native Faust plugin suite framework")

if(NOT APPLE)
  message(FATAL_ERROR "The current native adapter layer builds on macOS only.")
endif()

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_C_STANDARD 99)
enable_language(OBJC)

set(FWAK_GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/generated/apps/limiter-lab" CACHE PATH "Generated app config directory")
include(${FWAK_GENERATED_DIR}/project_config.cmake)

option(FWAK_BUILD_AUV2 "Build the AUv2 bundle" ON)
option(FWAK_BUILD_CLAP "Build the CLAP bundle" ON)
option(FWAK_BUILD_VST3 "Build the VST3 bundle" ON)
option(FWAK_BUILD_STANDALONE "Build the standalone app" ON)

set(FWAK_BUNDLE_NAME ${FWAK_ARTIFACT_STEM})
set(FWAK_PRODUCT_COPYRIGHT "${FWAK_COMPANY_NAME}")
set(FWAK_SHARED_PLUGIN_SOURCES
  src/plugin_core.c
  src/plugin_gui.m
)

set(FWAK_COMMON_INCLUDE_DIRS
  ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug
  ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug/clap
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${FWAK_GENERATED_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}
  /opt/homebrew/opt/faust/include
)

set(FWAK_COMMON_COMPILE_OPTIONS
  -include${CMAKE_CURRENT_SOURCE_DIR}/src/cplug_config.h
  -Werror=return-type
  -Wno-deprecated-declarations
  -Wno-nullability-completeness
)

set(FWAK_PLUGIN_LINK_LIBS
  "-framework AudioToolbox"
  "-framework CoreMIDI"
  "-framework Cocoa"
)

set(FWAK_AUDIO_COMPONENTS_XML "
  <key>AudioComponents</key>
  <array>
    <dict>
      <key>name</key>
      <string>${FWAK_COMPANY_NAME}: ${FWAK_PRODUCT_NAME}</string>
      <key>description</key>
      <string>${FWAK_PROJECT_DESCRIPTION}</string>
      <key>factoryFunction</key>
      <string>GetAUv2PluginFactory</string>
      <key>manufacturer</key>
      <string>${FWAK_AU_MANUFACTURER}</string>
      <key>sandboxSafe</key>
      <true/>
      <key>subtype</key>
      <string>${FWAK_AU_SUBTYPE}</string>
      <key>tags</key>
      <array>
        ${FWAK_AU_TAGS}
      </array>
      <key>type</key>
      <string>${FWAK_AU_TYPE}</string>
      <key>version</key>
      <integer>${FWAK_VERSION_INT}</integer>
    </dict>
  </array>")

function(configure_info_plist target_name bundle_identifier bundle_type bundle_extension extra_xml)
  set(FWAK_INFO_PLIST_EXTRA_XML "${extra_xml}")
  configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/resources/Info.plist.in
    ${CMAKE_BINARY_DIR}/${target_name}.plist
    @ONLY
  )

  set_target_properties(${target_name} PROPERTIES
    BUNDLE TRUE
    MACOSX_BUNDLE TRUE
    BUNDLE_EXTENSION ${bundle_extension}
    OUTPUT_NAME ${FWAK_BUNDLE_NAME}
    MACOSX_BUNDLE_INFO_PLIST ${CMAKE_BINARY_DIR}/${target_name}.plist
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
  )
endfunction()

function(add_cplug_bundle target_name bundle_extension bundle_identifier bundle_type wrapper_source extra_compile_defs extra_xml pkginfo_file)
  add_library(${target_name} MODULE
    ${FWAK_SHARED_PLUGIN_SOURCES}
    ${wrapper_source}
  )

  target_include_directories(${target_name} PRIVATE ${FWAK_COMMON_INCLUDE_DIRS})
  target_compile_options(${target_name} PRIVATE ${FWAK_COMMON_COMPILE_OPTIONS})
  target_compile_definitions(${target_name} PRIVATE ${extra_compile_defs})
  target_link_libraries(${target_name} PRIVATE ${FWAK_PLUGIN_LINK_LIBS})

  configure_info_plist(${target_name} ${bundle_identifier} ${bundle_type} ${bundle_extension} "${extra_xml}")

  if(NOT "${pkginfo_file}" STREQUAL "")
    add_custom_command(TARGET ${target_name} POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${pkginfo_file}
        ${CMAKE_BINARY_DIR}/${FWAK_BUNDLE_NAME}.${bundle_extension}/Contents/PkgInfo
    )
  endif()
endfunction()

if(FWAK_BUILD_AUV2)
  add_cplug_bundle(
    ${FWAK_BUNDLE_NAME}AU
    component
    ${FWAK_BUNDLE_ID}
    BNDL
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug/cplug_auv2.c
    "CPLUG_BUILD_AUV2=1;CPLUG_AUV2_VERSION_INT=${FWAK_VERSION_INT};CPLUG_AUV2_BUNDLE_ID=\"${FWAK_BUNDLE_ID}\""
    "${FWAK_AUDIO_COMPONENTS_XML}"
    ${CMAKE_CURRENT_SOURCE_DIR}/resources/PkgInfo
  )
endif()

if(FWAK_BUILD_CLAP)
  add_cplug_bundle(
    ${FWAK_BUNDLE_NAME}CLAP
    clap
    ${FWAK_BUNDLE_ID}.clap
    BNDL
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug/cplug_clap.c
    ""
    ""
    ${CMAKE_CURRENT_SOURCE_DIR}/resources/PkgInfo
  )
endif()

if(FWAK_BUILD_VST3)
  add_cplug_bundle(
    ${FWAK_BUNDLE_NAME}VST3
    vst3
    ${FWAK_BUNDLE_ID}.vst3
    BNDL
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug/cplug_vst3.c
    ""
    ""
    ${CMAKE_CURRENT_SOURCE_DIR}/resources/PkgInfo
  )
endif()

if(FWAK_BUILD_STANDALONE)
  add_executable(${FWAK_BUNDLE_NAME}App MACOSX_BUNDLE
    ${FWAK_SHARED_PLUGIN_SOURCES}
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug/cplug_standalone_osx.m
  )

  target_include_directories(${FWAK_BUNDLE_NAME}App PRIVATE ${FWAK_COMMON_INCLUDE_DIRS})
  target_compile_options(${FWAK_BUNDLE_NAME}App PRIVATE ${FWAK_COMMON_COMPILE_OPTIONS})
  target_link_libraries(${FWAK_BUNDLE_NAME}App PRIVATE
    "-framework Cocoa"
    "-framework CoreMIDI"
    "-framework CoreAudio"
    "-framework CoreServices"
    "-framework AudioToolbox"
  )

  configure_info_plist(${FWAK_BUNDLE_NAME}App ${FWAK_STANDALONE_BUNDLE_ID} APPL app "")

  add_custom_command(TARGET ${FWAK_BUNDLE_NAME}App POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      ${CMAKE_CURRENT_SOURCE_DIR}/resources/PkgInfo.app
      ${CMAKE_BINARY_DIR}/${FWAK_BUNDLE_NAME}.app/Contents/PkgInfo
  )
endif()
