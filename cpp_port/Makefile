CXX = g++
CXXFLAGS = -std=c++17 -O2
LIBS = -laubio -lsndfile

all: server

server: main.cpp httplib.h json.hpp
$(CXX) $(CXXFLAGS) main.cpp $(LIBS) -o server

clean:
rm -f server
