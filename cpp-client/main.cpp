#include <iostream>
#include <curl/curl.h>
#include <string>
#include <sstream>
#include <json/json.h>

class PolarisisClient {
private:
    std::string apiUrl;
    CURL* curl;

    // Callback to write response data
    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
        s->append((char*)contents, size * nmemb);
        return size * nmemb;
    }

public:
    PolarisisClient(std::string url = "http://localhost:8000") : apiUrl(url) {
        curl = curl_easy_init();
        if (!curl) {
            std::cerr << "Failed to initialize CURL" << std::endl;
        }
    }

    ~PolarisisClient() {
        if (curl) {
            curl_easy_cleanup(curl);
        }
    }

    std::string makeRequest(const std::string& endpoint, const std::string& jsonData) {
        if (!curl) return "";

        std::string fullUrl = apiUrl + endpoint;
        std::string readBuffer;

        struct curl_slist* headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: application/json");

        curl_easy_setopt(curl, CURLOPT_URL, fullUrl.c_str());
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonData.c_str());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);

        CURLcode res = curl_easy_perform(curl);

        if (res != CURLE_OK) {
            std::cerr << "CURL request failed: " << curl_easy_strerror(res) << std::endl;
        }

        curl_slist_free_all(headers);
        return readBuffer;
    }

    void requestDecision(double vessel_speed, double vessel_draft, const std::string& ice_capability) {
        std::cout << "=== POLARISIS C++ CLIENT ===" << std::endl;
        std::cout << "Requesting AI navigation decision..." << std::endl;

        Json::Value root;
        root["vessel_speed"] = vessel_speed;
        root["vessel_draft"] = vessel_draft;
        root["ice_capability"] = ice_capability;
        
        Json::Value hazards;
        hazards["ice_concentration"] = 0.45;
        hazards["wind_speed"] = 25.5;
        hazards["wave_height"] = 3.2;
        hazards["iceberg_distance"] = 8.5;
        hazards["ship_speed"] = vessel_speed;
        hazards["ship_draft"] = vessel_draft;
        root["hazards"] = hazards;

        Json::StreamWriterBuilder writer;
        std::string jsonData = Json::writeString(writer, root);

        std::string response = makeRequest("/decision", jsonData);

        // Parse response
        Json::Value responseJson;
        Json::CharReaderBuilder reader;
        std::string errs;
        std::istringstream stream(response);

        if (Json::parseFromStream(reader, stream, &responseJson, &errs)) {
            std::cout << "\n--- DECISION RECEIVED ---" << std::endl;
            std::cout << "Risk Score: " << responseJson["risk_score"].asDouble() << std::endl;
            std::cout << "Recommended Action: " << responseJson["action"].asString() << std::endl;
            std::cout << "ETA (minutes): " << responseJson["eta_minutes"].asInt() << std::endl;
            std::cout << "Confidence: " << responseJson["confidence"].asDouble() * 100 << "%" << std::endl;

            std::cout << "\nRecommended Route Waypoints:" << std::endl;
            const Json::Value& route = responseJson["recommended_route"];
            for (unsigned int i = 0; i < route.size(); ++i) {
                double lat = route[i]["lat"].asDouble();
                double lon = route[i]["lon"].asDouble();
                std::cout << "  [" << i + 1 << "] Lat: " << lat << ", Lon: " << lon << std::endl;
            }

            std::cout << "\n--- VESSEL STATUS ---" << std::endl;
            std::cout << "Vessel Speed: " << vessel_speed << " knots" << std::endl;
            std::cout << "Vessel Draft: " << vessel_draft << " meters" << std::endl;
            std::cout << "Ice Rating: " << ice_capability << std::endl;

            // Interpretation
            std::cout << "\n--- AI INTERPRETATION ---" << std::endl;
            if (responseJson["action"].asString() == "HALT") {
                std::cout << "⛔ CRITICAL: Halt immediately. Severe hazard conditions detected." << std::endl;
            } else if (responseJson["action"].asString() == "REROUTE") {
                std::cout << "⚠️  WARNING: Reroute recommended. Recommended waypoints provided above." << std::endl;
                std::cout << "   Current risk may reduce from ~" 
                          << responseJson["risk_score"].asDouble() * 100 << "% to safe levels." << std::endl;
            } else {
                std::cout << "✓ SAFE: Proceed with current course. Conditions are favorable." << std::endl;
            }
        } else {
            std::cerr << "Failed to parse JSON response: " << errs << std::endl;
            std::cerr << "Raw response: " << response << std::endl;
        }
    }
};

int main() {
    // Initialize CURL globally
    curl_global_init(CURL_GLOBAL_DEFAULT);

    PolarisisClient client("http://localhost:8000");

    // Simulate a vessel query
    std::cout << "POLARISIS - Autonomous Maritime Navigation System" << std::endl;
    std::cout << "====================================================\n" << std::endl;

    // Example vessel parameters
    double vessel_speed = 12.0;      // knots
    double vessel_draft = 5.2;       // meters
    std::string ice_capability = "ARC3";

    client.requestDecision(vessel_speed, vessel_draft, ice_capability);

    // Cleanup
    curl_global_cleanup();

    return 0;
}
