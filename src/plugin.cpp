#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <QDir>
#include <QCoreApplication>
#include <QFileInfo>
#include <QStandardPaths>
#include <QPointer>
#include "dock.hpp"

// Only these stable, public C frontend entry points are used. Runtime binding
// avoids copying OBS/Qt DLLs over the user's installation.
struct obs_module;
static obs_module *module = nullptr;
static QPointer<ShoutoutDock> dock;
static bool registered = false;
static constexpr const char *DockId = "shoutout-desk-obs";

template<typename T> static T api(const wchar_t *dll, const char *name) {
    auto handle=GetModuleHandleW(dll);
    return handle ? reinterpret_cast<T>(GetProcAddress(handle,name)) : nullptr;
}
extern "C" __declspec(dllexport) void obs_module_set_pointer(obs_module *pointer) { module=pointer; }
extern "C" __declspec(dllexport) uint32_t obs_module_ver(void) { return 32u << 24; }
extern "C" __declspec(dllexport) const char *obs_module_name(void) { return "Shoutout Desk OBS"; }
extern "C" __declspec(dllexport) const char *obs_module_description(void) { return "Local Twitch auto-shoutouts and history in an OBS dock."; }
extern "C" __declspec(dllexport) const char *obs_module_author(void) { return "FermionaPlay"; }
extern "C" __declspec(dllexport) bool obs_module_load(void) {
    return api<bool(*)(const char*,const char*,void*)>(L"obs-frontend-api.dll","obs_frontend_add_dock_by_id") &&
           api<const char*(*)(obs_module*)>(L"obs.dll","obs_get_module_data_path");
}
extern "C" __declspec(dllexport) void obs_module_post_load(void) {
    if(dock)return;
    auto add=api<bool(*)(const char*,const char*,void*)>(L"obs-frontend-api.dll","obs_frontend_add_dock_by_id");
    auto data=api<const char*(*)(obs_module*)>(L"obs.dll","obs_get_module_data_path");
    if(!add||!data||!module)return;
    const char *root=data(module);if(!root)return;
    auto profile=QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation)+"/Shoutout Desk OBS";
    const auto obsRoot=QDir(QCoreApplication::applicationDirPath()+"/../..").absolutePath();
    const auto args=QCoreApplication::arguments();
    if(QFileInfo::exists(obsRoot+"/portable_mode")||QFileInfo::exists(obsRoot+"/portable_mode.txt")||args.contains("--portable")||args.contains("-p"))
        profile=obsRoot+"/config/shoutout-desk-obs";
    const auto testProfile=qEnvironmentVariable("SHOUTOUT_DESK_OBS_TEST_PROFILE");
    const bool offlineTest=!testProfile.isEmpty()&&QDir::isAbsolutePath(testProfile);
    if(offlineTest)profile=testProfile;
    dock=new ShoutoutDock(QDir(QString::fromUtf8(root)).absolutePath(),profile,offlineTest);
    registered=add(DockId,"Shoutout Desk",dock.data());
    if(!registered){delete dock.data();dock=nullptr;}
}
extern "C" __declspec(dllexport) void obs_module_unload(void) {
    if(dock)dock->stop();
    auto remove=api<void(*)(const char*)>(L"obs-frontend-api.dll","obs_frontend_remove_dock");
    if(dock&&registered&&remove)remove(DockId);
    else delete dock.data();
    dock=nullptr;registered=false;
}
