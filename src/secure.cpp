#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <fcntl.h>
#include <io.h>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

int main(int argc, char **argv)
{
    if (argc != 2) return 2;
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    std::vector<char> input;
    char buffer[4096];
    while (std::cin.read(buffer, sizeof buffer) || std::cin.gcount()) {
        input.insert(input.end(), buffer, buffer + std::cin.gcount());
        if (input.size() > 1024 * 1024) return 3;
    }
    if (input.empty()) return 3;
    DATA_BLOB in{static_cast<DWORD>(input.size()), reinterpret_cast<BYTE *>(input.data())}, out{};
    const std::string mode = argv[1];
    BOOL ok = FALSE;
    if (mode == "encrypt")
        ok = CryptProtectData(&in, L"Shoutout Desk OBS", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out);
    else if (mode == "decrypt")
        ok = CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out);
    SecureZeroMemory(input.data(), input.size());
    if (!ok) return 4;
    std::cout.write(reinterpret_cast<const char *>(out.pbData), out.cbData);
    std::cout.flush();
    SecureZeroMemory(out.pbData, out.cbData);
    LocalFree(out.pbData);
    return std::cout.good() ? 0 : 5;
}
