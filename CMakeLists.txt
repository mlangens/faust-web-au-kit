cmake_minimum_required(VERSION 3.20)

project(faust_web_au_kit VERSION 0.1.0 DESCRIPTION "Native-target Faust framework proof of concept")

if(NOT APPLE)
  message(FATAL_ERROR "The AU proof of concept currently builds on macOS only.")
endif()

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_C_STANDARD 99)
enable_language(OBJC)

include(${CMAKE_CURRENT_SOURCE_DIR}/generated/project_config.cmake)

set(FWAK_TARGET_NAME LimiterLabAU)
set(FWAK_BUNDLE_NAME LimiterLab)
set(FWAK_PRODUCT_COPYRIGHT "${FWAK_COMPANY_NAME}")

function(configure_info_plist target_name bundle_identifier bundle_type bundle_extension)
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
  )
endfunction()

add_library(${FWAK_TARGET_NAME} MODULE
  src/plugin_core.c
  src/plugin_gui.m
  vendor/cplug/cplug_auv2.c
)

target_include_directories(${FWAK_TARGET_NAME} PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cplug
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/generated
  ${CMAKE_CURRENT_SOURCE_DIR}
  /opt/homebrew/opt/faust/include
)

target_compile_options(${FWAK_TARGET_NAME} PRIVATE
  -include${CMAKE_CURRENT_SOURCE_DIR}/src/cplug_config.h
  -Werror=return-type
  -Wno-deprecated-declarations
  -Wno-nullability-completeness
)

target_compile_definitions(${FWAK_TARGET_NAME} PRIVATE
  CPLUG_BUILD_AUV2=1
  CPLUG_AUV2_VERSION_INT=${FWAK_VERSION_INT}
  CPLUG_AUV2_BUNDLE_ID="${FWAK_BUNDLE_ID}"
)

target_link_libraries(${FWAK_TARGET_NAME} PRIVATE
  "-framework AudioToolbox"
  "-framework CoreMIDI"
  "-framework Cocoa"
)

configure_info_plist(${FWAK_TARGET_NAME} ${FWAK_BUNDLE_ID} "BNDL" "component")

add_custom_command(TARGET ${FWAK_TARGET_NAME} POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    ${CMAKE_CURRENT_SOURCE_DIR}/resources/PkgInfo
    ${CMAKE_BINARY_DIR}/${FWAK_BUNDLE_NAME}.component/Contents/PkgInfo
)
